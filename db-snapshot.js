const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'hotel.db'));

function exportSnapshot() {
  const users = db.prepare('SELECT id, name, email, role FROM users').all();
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY room_number').all();
  const bookings = db.prepare(`
    SELECT bookings.*, rooms.room_number, rooms.type AS room_type
    FROM bookings JOIN rooms ON bookings.room_id = rooms.id
    ORDER BY bookings.created_at DESC
  `).all();
  
  // Get history
  let history = [];
  try {
    history = db.prepare('SELECT * FROM booking_history ORDER BY archived_at DESC').all();
  } catch(e) {}

  const updated = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  let md = `# 🏨 VKVV Hotel Database\n\n`;
  md += `> Last updated: **${updated}**\n\n`;
  md += `---\n\n`;

  // Users Table
  md += `## 👤 Users (${users.length})\n\n`;
  if (users.length > 0) {
    md += `| ID | Name | Email | Role |\n`;
    md += `|----|------|-------|------|\n`;
    users.forEach(u => {
      md += `| ${u.id} | ${u.name} | ${u.email} | ${u.role} |\n`;
    });
  } else {
    md += `_No users registered yet._\n`;
  }

  md += `\n---\n\n`;

  // Rooms Table
  md += `## 🚪 Rooms (${rooms.length})\n\n`;
  if (rooms.length > 0) {
    md += `| ID | Room # | Type | Price (₹) | Status |\n`;
    md += `|----|--------|------|-----------|--------|\n`;
    rooms.forEach(r => {
      const status = r.status === 'booked' ? '🔴 Booked' : '🟢 Available';
      md += `| ${r.id} | ${r.room_number} | ${r.type} | ₹${r.price.toLocaleString('en-IN')} | ${status} |\n`;
    });
  } else {
    md += `_No rooms added yet._\n`;
  }

  md += `\n---\n\n`;

  // Bookings Table
  md += `## 📋 Bookings (${bookings.length})\n\n`;
  if (bookings.length > 0) {
    md += `| ID | Guest | Phone | Room | Type | Check-In | Check-Out | Amount (₹) | Created |\n`;
    md += `|----|-------|-------|------|------|----------|-----------|------------|--------|\n`;
    bookings.forEach(b => {
      md += `| ${b.id} | ${b.guest_name} | ${b.phone} | ${b.room_number} | ${b.room_type} | ${b.check_in} | ${b.check_out} | ₹${b.total_amount.toLocaleString('en-IN')} | ${b.created_at} |\n`;
    });
  } else {
    md += `_No bookings yet._\n`;
  }

  md += `\n---\n\n`;

  // History Table
  md += `## 🕰️ Booking History (${history.length})\n\n`;
  if (history.length > 0) {
    md += `| ID | Guest | Phone | Room | Type | Check-In | Check-Out | Amount (₹) | Archived On |\n`;
    md += `|----|-------|-------|------|------|----------|-----------|------------|-------------|\n`;
    history.forEach(h => {
      md += `| ${h.id} | ${h.guest_name} | ${h.phone} | ${h.room_number} | ${h.room_type} | ${h.check_in} | ${h.check_out} | ₹${h.total_amount.toLocaleString('en-IN')} | ${h.archived_at} |\n`;
    });
  } else {
    md += `_No history yet._\n`;
  }

  md += `\n---\n\n`;
  md += `_This file is auto-generated. Do not edit manually._\n`;

  fs.writeFileSync(path.join(__dirname, 'hotel-db-view.md'), md);
  console.log('📸 Database snapshot updated → hotel-db-view.md');
}

exportSnapshot();
