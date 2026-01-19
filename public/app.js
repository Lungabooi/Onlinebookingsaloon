let bookingsCache = [];
let currentMonth = new Date();
async function api(path, opts = {}) {
  opts.headers = opts.headers || {};
  const token = localStorage.getItem('token');
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json().catch(() => ({}));
}

async function loadServices() {
  const services = await api('/api/services');
  const list = document.getElementById('services-list');
  const select = document.querySelector('select[name=service_id]');
  list.innerHTML = '';
  select.innerHTML = '';
  services.forEach(s => {
    const li = document.createElement('li');
    li.textContent = `${s.name} — ${s.duration} min — $${s.price}`;
    list.appendChild(li);

    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  });
}

async function loadBookings() {
  const bookings = await api('/api/bookings');
  const list = document.getElementById('bookings-list');
  list.innerHTML = '';
  bookings.forEach(b => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${b.name}</strong> — ${b.service_name || 'Service'} on ${b.date} @ ${b.time} <button data-id="${b.id}" class="btn secondary small">Cancel</button>`;
    const btn = li.querySelector('button');
    btn.addEventListener('click', async () => {
      if (!confirm('Cancel booking?')) return;
      try {
        await api(`/api/bookings/${b.id}`, { method: 'DELETE' });
        loadBookings();
      } catch (err) {
        alert(err.message);
      }
    });
    list.appendChild(li);
  });
  bookingsCache = bookings;
  // render calendar if present
  try { renderCalendar(bookingsCache); } catch (e) {}
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => {
    v.style.display = v.getAttribute('data-view') === name ? '' : 'none';
  });
  // Update verification banner when switching to home
  try { updateVerifyBanner(); } catch (e) {}
  try { updateHomeAuthVisibility(); } catch (e) {}
}

function updateUserArea() {
  const area = document.getElementById('user-area');
  const name = localStorage.getItem('userName');
  const verified = localStorage.getItem('verified') === '1';
  const email = localStorage.getItem('email');
  const role = localStorage.getItem('role');
  if (name) {
    area.innerHTML = `${name} ${verified?'<span style="color:green;margin-left:8px">(Verified)</span>':'<span style="color:#c66;margin-left:8px">(Not verified)</span>'} <button id="logoutBtn" class="btn small secondary">Logout</button> ${role?`<span style="margin-left:8px">(${role})</span>`:''}`;
    if (!verified) {
      const btn = document.createElement('button');
      btn.textContent = 'Resend verification';
      btn.id = 'resendBtn';
      btn.className = 'btn secondary small';
      btn.style.marginLeft = '8px';
      area.appendChild(btn);
      btn.addEventListener('click', async () => {
        try {
          const res = await api('/api/resend-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
          alert(res.message || 'Verification email resent');
        } catch (err) {
          alert(err.message);
        }
      });
    }
    document.getElementById('logoutBtn').addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('userName');
      localStorage.removeItem('verified');
      localStorage.removeItem('email');
      localStorage.removeItem('role');
      updateUserArea();
    });
  } else {
    area.innerHTML = '';
  }
  try { updateHomeAuthVisibility(); } catch (e) {}
}

function updateHomeAuthVisibility() {
  const token = localStorage.getItem('token');
  const bookFormSection = document.getElementById('book-form');
  const bookingsSection = document.getElementById('bookings');
  const formMsg = document.getElementById('form-msg');
  if (!bookFormSection || !bookingsSection) return;
  if (token) {
    bookFormSection.style.display = '';
    bookingsSection.style.display = '';
    if (formMsg) formMsg.textContent = '';
    // ensure bookings are loaded for logged-in user
    try { loadBookings(); } catch (e) {}
  } else {
    bookFormSection.style.display = 'none';
    bookingsSection.style.display = 'none';
    if (formMsg) formMsg.textContent = 'Please login to make or view bookings.';
  }
}

function updateVerifyBanner() {
  const banner = document.getElementById('verifyBanner');
  if (!banner) return;
  const verified = localStorage.getItem('verified') === '1';
  const name = localStorage.getItem('userName');
  // show banner only on Home view and only for logged-in, not-verified users
  const homeVisible = document.querySelector('section[data-view="home"]').style.display !== 'none';
  if (name && !verified && homeVisible) {
    banner.style.display = '';
  } else {
    banner.style.display = 'none';
  }
  const resendBtn = document.getElementById('resendBannerBtn');
  if (resendBtn) {
    resendBtn.onclick = async () => {
      const email = localStorage.getItem('email');
      if (!email) return alert('No email available');
      try {
        const r = await api('/api/resend-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
        alert(r.message || 'Verification email resent');
      } catch (err) { alert(err.message); }
    };
  }
}

function setupNav() {
  document.querySelectorAll('.nav-link').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const view = a.getAttribute('data-view');
      showView(view);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  updateUserArea();
  showView('home');
  loadServices();
  loadBookings(); // This line remains unchanged

  const regForm = document.getElementById('registerForm');
  const regMsg = document.getElementById('register-msg');
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    regMsg.textContent = '';
    const data = Object.fromEntries(new FormData(regForm).entries());
    try {
      await api('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      regMsg.textContent = 'Registered — please login.';
      regForm.reset();
      showView('login');
    } catch (err) {
      regMsg.textContent = err.message;
    }
  });

  const loginForm = document.getElementById('loginForm');
  const loginMsg = document.getElementById('login-msg');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginMsg.textContent = '';
    const data = Object.fromEntries(new FormData(loginForm).entries());
    try {
      const res = await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      localStorage.setItem('token', res.token);
      localStorage.setItem('userName', res.name || '');
      localStorage.setItem('verified', res.verified ? '1' : '0');
      localStorage.setItem('email', res.email || data.email);
      localStorage.setItem('role', res.role || 'customer');
      updateUserArea();
      showView('home');
    } catch (err) {
      loginMsg.textContent = err.message;
    }
  });

  // Forgot password
  const forgotForm = document.getElementById('forgotForm');
  const forgotMsg = document.getElementById('forgot-msg');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      forgotMsg.textContent = '';
      const data = Object.fromEntries(new FormData(forgotForm).entries());
      try {
        const res = await api('/api/password-reset-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        forgotMsg.textContent = res.message || 'Reset email sent';
        forgotForm.reset();
      } catch (err) { forgotMsg.textContent = err.message; }
    });
  }

  // Reset password (if visiting reset page within SPA)
  const resetForm = document.getElementById('resetForm');
  const resetMsg = document.getElementById('reset-msg');
  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      resetMsg.textContent = '';
      const data = Object.fromEntries(new FormData(resetForm).entries());
      try {
        const res = await api('/api/password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        resetMsg.textContent = res.message || 'Password updated';
        resetForm.reset();
        showView('login');
      } catch (err) { resetMsg.textContent = err.message; }
    });
  }

  const form = document.getElementById('bookingForm');
  const msg = document.getElementById('form-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await api('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      msg.textContent = 'Booking created!';
      form.reset();
      loadBookings();
    } catch (err) {
      msg.textContent = err.message;
    }
  });

  // role is rendered by updateUserArea; no DOM append here

  // Calendar controls
  document.getElementById('prevMonth').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderCalendar(bookingsCache);
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderCalendar(bookingsCache);
  });

  // SSE for real-time updates
  try {
    const es = new EventSource('/events');
    es.addEventListener('bookings', (e) => {
      bookingsCache = JSON.parse(e.data || '[]');
      renderCalendar(bookingsCache);
      loadBookings();
    });
  } catch (err) {
    console.warn('SSE not available', err);
  }

  // Mobile nav toggle
  const navToggle = document.getElementById('navToggle');
  const topNav = document.querySelector('.top nav');
  if (navToggle && topNav) {
    navToggle.addEventListener('click', () => topNav.classList.toggle('open'));
    // close nav on link click
    topNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => topNav.classList.remove('open')));
  }
});

function renderCalendar(bookings) {
  const cal = document.getElementById('calendar');
  const label = document.getElementById('monthLabel');
  cal.innerHTML = '';
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  label.textContent = currentMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const grid = document.createElement('div');
  grid.className = 'calendar-grid';
  // weekday headers
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    const h = document.createElement('div'); h.className='cal-head'; h.textContent = d; grid.appendChild(h);
  });
  // empty slots
  for (let i=0;i<startDay;i++){ const e=document.createElement('div'); e.className='cal-cell empty'; grid.appendChild(e); }
  // days
  for (let d=1; d<=daysInMonth; d++){
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayBookings = bookings.filter(b => b.date === dateStr);
    const count = dayBookings.length;
    cell.innerHTML = `<div class="cal-day">${d}</div>` + (count?`<div class="cal-count">${count} booking${count>1?'s':''}</div>`:'');
    cell.addEventListener('click', () => showDayDetails(dateStr, dayBookings));
    grid.appendChild(cell);
  }
  cal.appendChild(grid);
}

function showDayDetails(dateStr, dayBookings){
  const dd = document.getElementById('dayDetails');
  if (!dayBookings || dayBookings.length===0){ dd.innerHTML = `<p>No bookings for ${dateStr}</p>`; return; }
  dd.innerHTML = `<h3>Bookings for ${dateStr}</h3>` + dayBookings.map(b=>`<div class="day-book"><strong>${b.time}</strong> — ${b.name} (${b.service_name||'Service'})</div>`).join('');
}
