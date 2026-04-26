const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'hotel.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'staff'
  );
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_number TEXT NOT NULL,
    type TEXT NOT NULL,
    price INTEGER NOT NULL,
    status TEXT DEFAULT 'available'
  );
  CREATE TABLE IF NOT EXISTS bookings (
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
  );
  CREATE TABLE IF NOT EXISTS booking_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_booking_id INTEGER,
    room_id INTEGER,
    room_number TEXT,
    room_type TEXT,
    guest_name TEXT,
    phone TEXT,
    guests_count INTEGER DEFAULT 1,
    check_in TEXT,
    check_out TEXT,
    total_amount INTEGER DEFAULT 0,
    user_id INTEGER,
    booked_at DATETIME,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const roomCount = db.prepare('SELECT COUNT(*) as count FROM rooms').get();
if (roomCount.count === 0) {
  const insert = db.prepare('INSERT INTO rooms (room_number, type, price) VALUES (?, ?, ?)');
  const rooms = [
    ['101', 'Standard', 1500],
    ['102', 'Standard', 1500],
    ['201', 'Deluxe', 3000],
    ['202', 'Deluxe', 3000],
    ['301', 'Suite', 6000],
    ['302', 'Suite', 6000],
    ['401', 'Presidential', 12000],
  ];
  rooms.forEach(([num, type, price]) => insert.run(num, type, price));
}

module.exports = db;