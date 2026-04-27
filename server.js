const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ADMIN_EMAILS = ['vkvvitworld@admin.com']; // Add more admin emails here if needed

// Auto-export database to readable Markdown after changes
function exportSnapshot() {
  try {
    const users = db.prepare('SELECT id, name, email, role FROM users').all();
    const rooms = db.prepare('SELECT * FROM rooms ORDER BY room_number').all();
    const bookings = db.prepare(`
      SELECT bookings.*, rooms.room_number, rooms.type AS room_type
      FROM bookings JOIN rooms ON bookings.room_id = rooms.id
      ORDER BY bookings.created_at DESC
    `).all();
    const history = db.prepare(`
      SELECT * FROM booking_history ORDER BY archived_at DESC
    `).all();
    const updated = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    let md = `# 🏨 VKVV Hotel Database\n\n`;
    md += `> Last updated: **${updated}**\n\n---\n\n`;

    md += `## 👤 Users (${users.length})\n\n`;
    md += `| ID | Name | Email | Role |\n|----|------|-------|------|\n`;
    users.forEach(u => { md += `| ${u.id} | ${u.name} | ${u.email} | ${u.role} |\n`; });

    md += `\n---\n\n## 🚪 Rooms (${rooms.length})\n\n`;
    md += `| ID | Room # | Type | Price | Status |\n|----|--------|------|-------|--------|\n`;
    rooms.forEach(r => {
      const s = r.status === 'booked' ? '🔴 Booked' : '🟢 Available';
      md += `| ${r.id} | ${r.room_number} | ${r.type} | ₹${r.price.toLocaleString('en-IN')} | ${s} |\n`;
    });

    md += `\n---\n\n## 📋 Bookings (${bookings.length})\n\n`;
    if (bookings.length > 0) {
      md += `| ID | Guest | Phone | Room | Type | Check-In | Check-Out | Amount | Created |\n|----|-------|-------|------|------|----------|-----------|--------|--------|\n`;
      bookings.forEach(b => {
        md += `| ${b.id} | ${b.guest_name} | ${b.phone} | ${b.room_number} | ${b.room_type} | ${b.check_in} | ${b.check_out} | ₹${b.total_amount.toLocaleString('en-IN')} | ${b.created_at} |\n`;
      });
    } else { md += `_No bookings yet._\n`; }

    md += `\n---\n\n## 🕰️ Booking History (${history.length})\n\n`;
    if (history.length > 0) {
      md += `| ID | Guest | Phone | Room | Type | Check-In | Check-Out | Amount | Archived On |\n|----|-------|-------|------|------|----------|-----------|--------|-------------|\n`;
      history.forEach(h => {
        md += `| ${h.id} | ${h.guest_name} | ${h.phone} | ${h.room_number} | ${h.room_type} | ${h.check_in} | ${h.check_out} | ₹${h.total_amount.toLocaleString('en-IN')} | ${h.archived_at} |\n`;
      });
    } else { md += `_No history yet._\n`; }

    md += `\n---\n_Auto-generated. Do not edit._\n`;
    fs.writeFileSync(path.join(__dirname, 'hotel-db-view.md'), md);
  } catch (e) { /* silent */ }
}

// Move past bookings to history
function archiveExpiredBookings() {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const expired = db.prepare(`
      SELECT bookings.*, rooms.room_number, rooms.type AS room_type
      FROM bookings JOIN rooms ON bookings.room_id = rooms.id
      WHERE bookings.check_out < ?
    `).all(today);

    if (expired.length > 0) {
      const insertHistory = db.prepare(`
        INSERT INTO booking_history 
        (original_booking_id, room_id, room_number, room_type, guest_name, phone, guests_count, check_in, check_out, total_amount, user_id, booked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const deleteBooking = db.prepare('DELETE FROM bookings WHERE id = ?');
      const updateRoom = db.prepare('UPDATE rooms SET status = "available" WHERE id = ?');

      const transaction = db.transaction(() => {
        for (const b of expired) {
          insertHistory.run(b.id, b.room_id, b.room_number, b.room_type, b.guest_name, b.phone, b.guests_count, b.check_in, b.check_out, b.total_amount, b.user_id, b.created_at);
          deleteBooking.run(b.id);
          updateRoom.run(b.room_id);
        }
      });
      transaction();
      console.log(`Archived ${expired.length} expired bookings.`);
      exportSnapshot();
    }
  } catch (err) {
    console.error("Archive error:", err);
  }
}

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

function isAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
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
    const role = ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'staff'; // default to staff/user
    db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
      .run(name.trim(), email.toLowerCase(), hash, role);
    exportSnapshot();
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

  const total_amount = room.price * nights * guests_count;

  try {
    const result = db.prepare(
      'INSERT INTO bookings (room_id, guest_name, phone, aadhar, guests_count, check_in, check_out, total_amount, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(room_id, guest_name, phone, aadhar, guests_count, check_in, check_out, total_amount, req.user.id);

    db.prepare("UPDATE rooms SET status = 'booked' WHERE id = ?").run(room_id);

    exportSnapshot();
    res.json({
      message: 'Booking confirmed',
      id: result.lastInsertRowid,
      bill: { guest: guest_name, phone, room: room.room_number, type: room.type, nights, guests_count, price_per_night: room.price, total_amount, check_in, check_out }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET BOOKINGS
app.get('/api/bookings', authMiddleware, (req, res) => {
  let query = `
    SELECT bookings.*, rooms.room_number, rooms.type, rooms.price
    FROM bookings JOIN rooms ON bookings.room_id = rooms.id
  `;
  let rows;
  
  if (req.user.role === 'admin') {
    query += ' ORDER BY bookings.created_at DESC';
    rows = db.prepare(query).all();
  } else {
    query += ' WHERE bookings.user_id = ? ORDER BY bookings.created_at DESC';
    rows = db.prepare(query).all(req.user.id);
  }
  
  res.json(rows);
}); 

// GET HISTORY
app.get('/api/history', authMiddleware, (req, res) => {
  let rows;
  if (req.user.role === 'admin') {
    rows = db.prepare('SELECT * FROM booking_history ORDER BY archived_at DESC').all();
  } else {
    rows = db.prepare('SELECT * FROM booking_history WHERE user_id = ? ORDER BY archived_at DESC').all(req.user.id);
  }
  res.json(rows);
});

// CHECKOUT
app.put('/api/bookings/:id/checkout', authMiddleware, isAdmin, (req, res) => {
  const booking = db.prepare(`
    SELECT bookings.*, rooms.room_number, rooms.type AS room_type 
    FROM bookings JOIN rooms ON bookings.room_id = rooms.id 
    WHERE bookings.id = ?
  `).get(req.params.id);
  
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  
  const insertHistory = db.prepare(`
    INSERT INTO booking_history 
    (original_booking_id, room_id, room_number, room_type, guest_name, phone, guests_count, check_in, check_out, total_amount, user_id, booked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const transaction = db.transaction(() => {
    insertHistory.run(booking.id, booking.room_id, booking.room_number, booking.room_type, booking.guest_name, booking.phone, booking.guests_count, booking.check_in, booking.check_out, booking.total_amount, booking.user_id, booking.created_at);
    db.prepare('UPDATE rooms SET status = "available" WHERE id = ?').run(booking.room_id);
    db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  });
  
  transaction();
  exportSnapshot();
  res.json({ message: 'Checked out successfully' });
});

// STATS (Admin only)
app.get('/api/stats', authMiddleware, isAdmin, (req, res) => {
  const total  = db.prepare('SELECT COUNT(*) as total FROM rooms').get();
  const booked = db.prepare("SELECT COUNT(*) as booked FROM rooms WHERE status = 'booked'").get();
  const guests = db.prepare('SELECT COUNT(*) as guests FROM bookings').get();
  const rev    = db.prepare('SELECT SUM(total_amount) as revenue FROM bookings').get();
  res.json({
    total: total.total,
    booked: booked.booked,
    available: total.total - booked.booked,
    guests: guests.guests,
    revenue: rev.revenue || 0
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  archiveExpiredBookings(); // Archive any expired bookings on startup
  exportSnapshot(); // Generate initial snapshot on startup
  console.log(`🏨 VKVV Hotel Server → http://localhost:${PORT}`);
});