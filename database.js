const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'hotel.db'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'staff'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_number TEXT NOT NULL,
    type TEXT NOT NULL,
    price INTEGER NOT NULL,
    status TEXT DEFAULT 'available'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER,
    guest_name TEXT,
    phone TEXT,
    aadhar TEXT,
    guests_count INTEGER DEFAULT 1,
    check_in TEXT,
    check_out TEXT,
    total_amount INTEGER DEFAULT 0,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.get('SELECT COUNT(*) as count FROM rooms', [], (err, row) => {
    if (row.count === 0) {
      const rooms = [
        ['101', 'Standard', 1500],
        ['102', 'Standard', 1500],
        ['201', 'Deluxe', 3000],
        ['202', 'Deluxe', 3000],
        ['301', 'Suite', 6000],
        ['302', 'Suite', 6000],
        ['401', 'Presidential', 12000],
      ];
      rooms.forEach(([num, type, price]) => {
        db.run('INSERT INTO rooms (room_number, type, price) VALUES (?, ?, ?)', [num, type, price]);
      });
    }
  });
});

module.exports = db;