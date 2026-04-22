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
  try {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)')
      .run(name.trim(), email.toLowerCase(), hash);
    res.json({ message: 'Registered successfully' });
  } catch (err) {
    res.status(400).json({ error: 'Email already registered' });
  }
});

// LOGIN
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(400).json({ error: 'No account found with this email' });
  if (!bcrypt.compareSync(password, user.password))
    return res.status(400).json({ error: 'Incorrect password' });
  const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, SECRET);
  res.json({ token, name: user.name, role: user.role });
});

// GET ROOMS
app.get('/api/rooms', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM rooms ORDER BY price ASC').all();
  res.json(rows);
});

// CREATE BOOKING
app.post('/api/bookings', authMiddleware, (req, res) => {
  const { room_id, guest_name, phone, aadhar, guests_count, check_in, check_out } = req.body;
  if (!guest_name || !phone || !aadhar || !room_id || !check_in || !check_out)
    return res.status(400).json({ error: 'All fields are required' });
  if (!/^\d{10}$/.test(phone))
    return res.status(400).json({ error: 'Phone must be 10 digits' });
  if (!/^\d{12}$/.test(aadhar))
    return res.status(400).json({ error: 'Aadhar must be 12 digits' });

  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(room_id);
  if (!room) return res.status(400).json({ error: 'Room not found' });
  if (room.status === 'booked') return res.status(400).json({ error: 'Room already booked' });

  const nights = Math.ceil((new Date(check_out) - new Date(check_in)) / 86400000);
  if (nights <= 0) return res.status(400).json({ error: 'Check-out must be after check-in' });

  const total_amount = room.price * nights;

  try {
    const result = db.prepare(
      'INSERT INTO bookings (room_id, guest_name, phone, aadhar, guests_count, check_in, check_out, total_amount, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(room_id, guest_name, phone, aadhar, guests_count, check_in, check_out, total_amount, req.user.id);

    db.prepare("UPDATE rooms SET status = 'booked' WHERE id = ?").run(room_id);

    res.json({
      message: 'Booking confirmed',
      id: result.lastInsertRowid,
      bill: { guest: guest_name, room: room.room_number, type: room.type, nights, price_per_night: room.price, total_amount, check_in, check_out }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET BOOKINGS
app.get('/api/bookings', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT bookings.*, rooms.room_number, rooms.type, rooms.price
    FROM bookings JOIN rooms ON bookings.room_id = rooms.id
    WHERE bookings.user_id = ?
    ORDER BY bookings.created_at DESC
  `).all(req.user.id);
  res.json(rows);
}); 

// CHECKOUT
app.put('/api/bookings/:id/checkout', authMiddleware, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  db.prepare('UPDATE rooms SET status = "available" WHERE id = ?').run(booking.room_id);
  db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  res.json({ message: 'Checked out successfully' });
});

// STATS
app.get('/api/stats', authMiddleware, (req, res) => {
  const total  = db.prepare('SELECT COUNT(*) as total FROM rooms').get();
  const booked = db.prepare("SELECT COUNT(*) as booked FROM rooms WHERE status = 'booked'").get();
  const guests = db.prepare('SELECT COUNT(*) as guests FROM bookings').get();
  const rev    = db.prepare('SELECT SUM(total_amount) as revenue FROM bookings').get();
 const isAdmin = req.user.role === 'admin';
  res.json({
    total: total.total,
    booked: booked.booked,
    available: total.total - booked.booked,
    guests: guests.guests,
    revenue: isAdmin ? (rev.revenue || 0) : null
  });
});

const PORT = process.env.PORT || 3000;
app.get('/api/cleardata', (req, res) => {
  db.prepare('DELETE FROM bookings').run();
  db.prepare("UPDATE rooms SET status='available'").run();
  res.json({ message: 'All bookings cleared!' });
});
app.listen(PORT, () => console.log(`🏨 VKVV Hotel Server → http://localhost:${PORT}`));