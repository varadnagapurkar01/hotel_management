const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const SECRET = 'vkvv_hotel_secret_2024';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// REGISTER
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name || name.trim().length < 3)
    return res.status(400).json({ error: 'Name must be at least 3 characters' });
  if (!emailRegex.test(email))
    return res.status(400).json({ error: 'Enter a valid email address' });
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const hash = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
    [name.trim(), email.toLowerCase(), hash],
    function (err) {
      if (err) return res.status(400).json({ error: 'Email already registered' });
      res.json({ message: 'Registered successfully' });
    });
});

// LOGIN
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });
  db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()], (err, user) => {
    if (!user) return res.status(400).json({ error: 'No account found with this email' });
    if (!bcrypt.compareSync(password, user.password))
      return res.status(400).json({ error: 'Incorrect password' });
    const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, SECRET);
    res.json({ token, name: user.name, role: user.role });
  });
});

// GET ROOMS - ascending price order
app.get('/api/rooms', authMiddleware, (req, res) => {
  db.all('SELECT * FROM rooms ORDER BY price ASC', [], (err, rows) => res.json(rows));
});

// CREATE BOOKING with bill calculation
app.post('/api/bookings', authMiddleware, (req, res) => {
  const { room_id, guest_name, phone, aadhar, guests_count, check_in, check_out } = req.body;

  if (!guest_name || !phone || !aadhar || !room_id || !check_in || !check_out)
    return res.status(400).json({ error: 'All fields are required' });
  if (!/^\d{10}$/.test(phone))
    return res.status(400).json({ error: 'Phone must be 10 digits' });
  if (!/^\d{12}$/.test(aadhar))
    return res.status(400).json({ error: 'Aadhar must be 12 digits' });

  db.get('SELECT * FROM rooms WHERE id = ?', [room_id], (err, room) => {
    if (!room) return res.status(400).json({ error: 'Room not found' });
    if (room.status === 'booked') return res.status(400).json({ error: 'Room already booked' });

    const inDate  = new Date(check_in);
    const outDate = new Date(check_out);
    const nights  = Math.ceil((outDate - inDate) / (1000 * 60 * 60 * 24));
    if (nights <= 0) return res.status(400).json({ error: 'Check-out must be after check-in' });

    const total_amount = room.price * nights;

    db.run(
      'INSERT INTO bookings (room_id, guest_name, phone, aadhar, guests_count, check_in, check_out, total_amount, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [room_id, guest_name, phone, aadhar, guests_count, check_in, check_out, total_amount, req.user.id],
      function (err) {
        if (err) return res.status(400).json({ error: err.message });
        db.run('UPDATE rooms SET status = "booked" WHERE id = ?', [room_id]);
        res.json({
          message: 'Booking confirmed',
          id: this.lastID,
          bill: {
            guest: guest_name,
            room: room.room_number,
            type: room.type,
            nights,
            price_per_night: room.price,
            total_amount,
            check_in,
            check_out
          }
        });
      }
    );
  });
});

// GET BOOKINGS
app.get('/api/bookings', authMiddleware, (req, res) => {
  db.all(
    `SELECT bookings.*, rooms.room_number, rooms.type, rooms.price
     FROM bookings JOIN rooms ON bookings.room_id = rooms.id
     ORDER BY bookings.created_at DESC`,
    [], (err, rows) => res.json(rows)
  );
});

// CHECKOUT
app.put('/api/bookings/:id/checkout', authMiddleware, (req, res) => {
  db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id], (err, booking) => {
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    db.run('UPDATE rooms SET status = "available" WHERE id = ?', [booking.room_id]);
    db.run('DELETE FROM bookings WHERE id = ?', [req.params.id]);
    res.json({ message: 'Checked out successfully' });
  });
});

// STATS
app.get('/api/stats', authMiddleware, (req, res) => {
  db.get('SELECT COUNT(*) as total FROM rooms', [], (err, total) => {
    if (err || !total) return res.json({ total: 0, booked: 0, available: 0, guests: 0, revenue: 0 });
    db.get('SELECT COUNT(*) as booked FROM rooms WHERE status = "booked"', [], (err2, booked) => {
      if (err2 || !booked) return res.json({ total: total.total, booked: 0, available: total.total, guests: 0, revenue: 0 });
      db.get('SELECT COUNT(*) as guests FROM bookings', [], (err3, guests) => {
        if (err3 || !guests) return res.json({ total: total.total, booked: booked.booked, available: total.total - booked.booked, guests: 0, revenue: 0 });
        db.get('SELECT SUM(total_amount) as revenue FROM bookings', [], (err4, rev) => {
          res.json({
            total: total.total,
            booked: booked.booked,
            available: total.total - booked.booked,
            guests: guests.guests,
            revenue: (rev && rev.revenue) ? rev.revenue : 0
          });
        });
      });
    });
  });
});

app.listen(3000, () => console.log('🏨 VKVV Hotel Server → http://localhost:3000'));