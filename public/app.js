const API = 'http://localhost:3000/api';
let token = localStorage.getItem('token');
let allRooms = [];

const roomImages = {
  'Standard':     'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400&auto=format&fit=crop',
  'Deluxe':       'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=400&auto=format&fit=crop',
  'Suite':        'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=400&auto=format&fit=crop',
  'Presidential': 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=400&auto=format&fit=crop'
};

// CLOCK
function updateClock() {
  const now = new Date();
  document.getElementById('clockDisplay').textContent =
    now.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' }) +
    '  •  ' + now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// TABS
function showTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
  btn.classList.add('active');
  document.getElementById(tab + 'Form').classList.remove('hidden');
}

// REGISTER
async function register() {
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl    = document.getElementById('registerError');

  errEl.textContent = '';
  const emailOK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (name.length < 3) { errEl.style.color='#e74c3c'; errEl.textContent='Name must be at least 3 characters'; return; }
  if (!emailOK)        { errEl.style.color='#e74c3c'; errEl.textContent='Enter a valid email address'; return; }
  if (password.length < 6) { errEl.style.color='#e74c3c'; errEl.textContent='Password must be at least 6 characters'; return; }

  const res  = await fetch(`${API}/register`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name, email, password })
  });
  const data = await res.json();
  if (res.ok) {
    errEl.style.color = '#2ecc71';
    errEl.textContent = '✅ Account created! Please sign in.';
    setTimeout(() => showTab('login', document.querySelector('.tab-btn')), 1500);
  } else {
    errEl.style.color = '#e74c3c';
    errEl.textContent = data.error;
  }
}

// LOGIN
async function login() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  errEl.textContent = '';

  if (!email || !password) { errEl.style.color='#e74c3c'; errEl.textContent='Enter email and password'; return; }

  const res  = await fetch(`${API}/login`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (res.ok) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('userName', data.name);
    localStorage.setItem('userRole', data.role);
    token = data.token;
    initApp(data.name, data.role);
  } else {
    errEl.style.color = '#e74c3c';
    errEl.textContent = data.error;
  }
}

// LOGOUT
function logout() {
  localStorage.clear(); token = null;
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
}

// INIT
function initApp(name, role) {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('userName').textContent    = name;
  document.getElementById('userRole').textContent    = role;
  document.getElementById('welcomeName').textContent = name;
  document.getElementById('userAvatar').textContent  = name.charAt(0).toUpperCase();
  loadStats();
  loadRooms();
}

if (token) initApp(localStorage.getItem('userName'), localStorage.getItem('userRole'));

// STATS
async function loadStats() {
  const res  = await fetch(`${API}/stats`, { headers:{ Authorization: `Bearer ${token}` } });
  const data = await res.json();
  document.getElementById('statTotal').textContent     = data.total;
  document.getElementById('statAvailable').textContent = data.available;
  document.getElementById('statBooked').textContent    = data.booked;
  document.getElementById('statRevenue').textContent   = '₹' + data.revenue.toLocaleString('en-IN');
  const pct = data.total ? Math.round((data.available / data.total) * 100) : 0;
  document.getElementById('availBar').style.width  = pct + '%';
  document.getElementById('bookedBar').style.width = (100 - pct) + '%';
}

// ROOMS
async function loadRooms() {
  const res = await fetch(`${API}/rooms`, { headers:{ Authorization: `Bearer ${token}` } });
  allRooms  = await res.json();
  renderRooms(allRooms);
  populateRoomSelect(allRooms.filter(r => r.status === 'available'));
}

function renderRooms(rooms) {
  document.getElementById('roomsGrid').innerHTML = rooms.map(r => `
    <div class="room-card">
      <img class="room-card-img" src="${roomImages[r.type] || roomImages['Standard']}" alt="${r.type}"/>
      <div class="room-card-body">
        <div class="room-number">${r.room_number}</div>
        <div class="room-type">${r.type} Room</div>
        <div class="room-price">₹${r.price.toLocaleString('en-IN')}/night</div>
        <span class="room-status status-${r.status}">
          ${r.status === 'available' ? '● Available' : '● Occupied'}
        </span>
      </div>
    </div>`).join('');
}

function filterRooms(status, btn) {
  document.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderRooms(status === 'all' ? allRooms : allRooms.filter(r => r.status === status));
}

function populateRoomSelect(rooms) {
  document.getElementById('roomSelect').innerHTML = rooms.length
    ? rooms.map(r => `<option value="${r.id}">Room ${r.room_number} — ${r.type} (₹${r.price.toLocaleString('en-IN')}/night)</option>`).join('')
    : '<option disabled>No rooms available</option>';
  updateBillPreview();
}

// BILL PREVIEW
function updateBillPreview() {
  const roomSel  = document.getElementById('roomSelect');
  const checkIn  = document.getElementById('checkIn').value;
  const checkOut = document.getElementById('checkOut').value;
  const preview  = document.getElementById('billPreview');
  if (!roomSel.value || !checkIn || !checkOut) {
    preview.textContent = 'Select room & dates to see bill'; return;
  }
  const room   = allRooms.find(r => r.id == roomSel.value);
  const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / 86400000);
  if (!room || nights <= 0) { preview.textContent = 'Check-out must be after check-in'; return; }
  preview.textContent = `${nights} night${nights>1?'s':''} × ₹${room.price.toLocaleString('en-IN')} = ₹${(nights*room.price).toLocaleString('en-IN')}`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('roomSelect')?.addEventListener('change', updateBillPreview);
  document.getElementById('checkIn')?.addEventListener('change', updateBillPreview);
  document.getElementById('checkOut')?.addEventListener('change', updateBillPreview);
});

// BOOKINGS
async function loadBookings() {
  const res  = await fetch(`${API}/bookings`, { headers:{ Authorization: `Bearer ${token}` } });
  const data = await res.json();
  const list = document.getElementById('bookingsList');
  if (!data.length) {
    list.innerHTML = '<div style="text-align:center;padding:60px;color:var(--muted);font-size:15px;">No bookings yet.</div>';
    return;
  }
  list.innerHTML = data.map((b, i) => `
    <div class="booking-card">
      <div class="booking-num">${String(i+1).padStart(2,'0')}</div>
      <div class="booking-details">
        <h3>${b.guest_name}</h3>
        <p>Room ${b.room_number} · ${b.type} · ${b.guests_count} guest${b.guests_count>1?'s':''} · 📞 ${b.phone}</p>
      </div>
      <div class="booking-meta">
        <div class="booking-dates">${b.check_in} → ${b.check_out}</div>
        <div class="booking-amount">₹${(b.total_amount||0).toLocaleString('en-IN')}</div>
        <button class="checkout-btn" onclick="checkout(${b.id})">
          <i class="fas fa-sign-out-alt"></i> Checkout
        </button>
      </div>
    </div>`).join('');
}

// CREATE BOOKING
async function createBooking() {
  const guest_name   = document.getElementById('guestName').value.trim();
  const phone        = document.getElementById('guestPhone').value.trim();
  const aadhar       = document.getElementById('guestAadhar').value.trim();
  const guests_count = document.getElementById('guestsCount').value;
  const room_id      = document.getElementById('roomSelect').value;
  const check_in     = document.getElementById('checkIn').value;
  const check_out    = document.getElementById('checkOut').value;
  const msgEl        = document.getElementById('bookingMsg');
  msgEl.textContent  = '';

  if (!guest_name || !phone || !aadhar || !room_id || !check_in || !check_out) {
    msgEl.style.color = '#e74c3c';
    msgEl.textContent = '⚠️ Please fill all fields.';
    return;
  }

  let res;
  try {
    res = await fetch(`${API}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ guest_name, phone, aadhar, guests_count, room_id, check_in, check_out })
    });
  } catch (err) {
    msgEl.style.color = '#e74c3c';
    msgEl.textContent = '❌ Backend not reachable';
    return;
  }

  const data = await res.json();

  if (res.ok) {
    showBill(data.bill);
    loadRooms();
    loadStats();

    document.getElementById('guestName').value = '';
    document.getElementById('guestPhone').value = '';
    document.getElementById('guestAadhar').value = '';
    document.getElementById('checkIn').value = '';
    document.getElementById('checkOut').value = '';
    document.getElementById('billPreview').textContent = 'Select room & dates to see bill';
  } else {
    msgEl.style.color = '#e74c3c';
    msgEl.textContent = data.error;
  }
}

// SHOW BILL MODAL
function showBill(bill) {
  document.getElementById('billBody').innerHTML = `
    <div class="bill-row"><span class="lbl">Guest Name</span><span class="val">${bill.guest}</span></div>
    <div class="bill-row"><span class="lbl">Room</span><span class="val">${bill.room} (${bill.type})</span></div>
    <div class="bill-row"><span class="lbl">Check-In</span><span class="val">${bill.check_in}</span></div>
    <div class="bill-row"><span class="lbl">Check-Out</span><span class="val">${bill.check_out}</span></div>
    <div class="bill-row"><span class="lbl">Duration</span><span class="val">${bill.nights} Night${bill.nights>1?'s':''}</span></div>
    <div class="bill-row"><span class="lbl">Rate/Night</span><span class="val">₹${bill.price_per_night.toLocaleString('en-IN')}</span></div>
    <div class="bill-total"><span class="lbl">Total Amount</span><span class="val">₹${bill.total_amount.toLocaleString('en-IN')}</span></div>
  `;
  document.getElementById('billModal').classList.remove('hidden');
}

function closeBill() {
  document.getElementById('billModal').classList.add('hidden');
}

// CHECKOUT
async function checkout(id) {
  if (!confirm('Confirm checkout for this guest?')) return;
  await fetch(`${API}/bookings/${id}/checkout`, { method:'PUT', headers:{ Authorization: `Bearer ${token}` } });
  loadBookings(); loadRooms(); loadStats();
}

// NAVIGATION
function showPage(page, el) {
  document.querySelectorAll('.page').forEach(p => { p.classList.add('hidden'); p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(page+'Page').classList.remove('hidden');
  document.getElementById(page+'Page').classList.add('active');
  if (el) el.classList.add('active');
  const titles = {
    dashboard:  ['Dashboard','Overview of hotel operations'],
    rooms:      ['Room Directory','All rooms sorted by price'],
    bookings:   ['Bookings','All current guest bookings'],
    newbooking: ['New Booking','Reserve a room for a guest']
  };
  document.getElementById('pageTitle').textContent    = titles[page][0];
  document.getElementById('pageSubtitle').textContent = titles[page][1];
  if (page==='bookings')   loadBookings();
  if (page==='rooms')      loadRooms();
}