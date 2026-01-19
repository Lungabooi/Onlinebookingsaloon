const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const DB_PATH = path.join(DATA_DIR, 'bookings.db');
const db = new sqlite3.Database(DB_PATH);
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const sseClients = new Set();

// Setup mailer. If SMTP env vars are provided, use them; otherwise fall back to Ethereal test account.
let mailerTransport;
async function getMailer() {
  if (mailerTransport) return mailerTransport;
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    mailerTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    return mailerTransport;
  }
  const testAccount = await nodemailer.createTestAccount();
  mailerTransport = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: { user: testAccount.user, pass: testAccount.pass }
  });
  console.log('Using Ethereal account for emails; preview at', testAccount.user);
  return mailerTransport;
}

async function sendVerificationEmail(userEmail, token) {
  const transporter = await getMailer();
  const verifyUrl = `${process.env.APP_URL || `http://localhost:${PORT || 4000}`}/api/verify?token=${token}`;
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'no-reply@salon.local',
    to: userEmail,
    subject: 'Verify your email',
    text: `Please verify your account by visiting: ${verifyUrl}`,
    html: `<p>Please verify your account by clicking <a href="${verifyUrl}">this link</a>.</p>`
  });
  if (nodemailer.getTestMessageUrl && info) {
    const url = nodemailer.getTestMessageUrl(info);
    if (url) console.log('Preview email at:', url);
  }
}
async function broadcastBookings() {
  try {
    const rows = await allSql(
      `SELECT b.*, s.name as service_name, s.duration, s.price
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       ORDER BY b.date, b.time`
    );
    const payload = JSON.stringify(rows);
    for (const res of sseClients) {
      res.write(`event: bookings\n`);
      res.write(`data: ${payload}\n\n`);
    }
  } catch (err) {
    console.error('broadcast error', err);
  }
}

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function allSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function getSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function initDb() {
  await runSql(
    `CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      duration INTEGER,
      price REAL
    )`
  );

  await runSql(
    `CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      service_id INTEGER,
      date TEXT,
      time TEXT,
      created_at TEXT,
      user_id INTEGER,
      FOREIGN KEY(service_id) REFERENCES services(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`
  );

  // Add user_id column to existing bookings if missing
  await runSql('ALTER TABLE bookings ADD COLUMN user_id INTEGER').catch(()=>{});

  await runSql(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT,
      verified INTEGER DEFAULT 0,
      verify_token TEXT,
      role TEXT DEFAULT 'customer',
      reset_token TEXT,
      reset_expires INTEGER
    )`
  );

  // Add columns to existing users table if they are missing (safe to run)
  await runSql('ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0').catch(()=>{});
  await runSql('ALTER TABLE users ADD COLUMN verify_token TEXT').catch(()=>{});
  await runSql("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'customer'").catch(()=>{});
  await runSql('ALTER TABLE users ADD COLUMN reset_token TEXT').catch(()=>{});
  await runSql('ALTER TABLE users ADD COLUMN reset_expires INTEGER').catch(()=>{});

  const row = await getSql('SELECT COUNT(*) as cnt FROM services');
  if (!row || row.cnt === 0) {
    const services = [
      ['Haircut', 30, 25.0],
      ['Beard Trim', 15, 12.0],
      ['Hair Coloring', 90, 80.0]
    ];
    for (const s of services) {
      await runSql('INSERT INTO services (name,duration,price) VALUES (?,?,?)', s);
    }
    console.log('Seeded services');
  }
}

initDb().catch((err) => {
  console.error('DB init error', err);
  process.exit(1);
});

app.get('/api/services', async (req, res) => {
  try {
    const rows = await allSql('SELECT * FROM services');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Server-Sent Events endpoint for real-time updates
app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();
  res.write('retry: 10000\n\n');
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing Authorization' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid Authorization' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const hash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(24).toString('hex');
    // default role is 'customer' for self-registered users
    await runSql('INSERT INTO users (name,email,password,created_at,verified,verify_token,role) VALUES (?,?,?,?,0,?,?)', [name, email, hash, new Date().toISOString(), token, 'customer']);
    // send verification email (async)
    sendVerificationEmail(email, token).catch(err => console.error('email send error', err));
    res.json({ success: true, message: 'Registered — check your email to verify your account.' });
  } catch (err) {
    if (err && err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Verify route — activates account when token matches
app.get('/api/verify', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).send('Missing token');
    const user = await getSql('SELECT * FROM users WHERE verify_token = ?', [token]);
    if (!user) return res.status(400).send('Invalid token');
    await runSql('UPDATE users SET verified = 1, verify_token = NULL WHERE id = ?', [user.id]);
    return res.send('Email verified. You can now login.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

async function requireVerified(req, res, next) {
  try {
    const user = await getSql('SELECT verified FROM users WHERE id = ?', [req.user && req.user.id]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!user.verified) return res.status(403).json({ error: 'Email not verified' });
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function requireRole(role) {
  return async (req, res, next) => {
    try {
      const user = await getSql('SELECT role FROM users WHERE id = ?', [req.user && req.user.id]);
      if (!user) return res.status(401).json({ error: 'User not found' });
      if (user.role !== role) return res.status(403).json({ error: 'Insufficient role' });
      next();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    const user = await getSql('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role || 'customer' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, name: user.name, verified: user.verified ? 1 : 0, email: user.email, role: user.role || 'customer' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    const user = await getSql('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.verified) return res.status(400).json({ error: 'User already verified' });
    const token = crypto.randomBytes(24).toString('hex');
    await runSql('UPDATE users SET verify_token = ? WHERE id = ?', [token, user.id]);
    sendVerificationEmail(email, token).catch(err => console.error('email send error', err));
    res.json({ success: true, message: 'Verification email resent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Password reset: request
app.post('/api/password-reset-request', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    const user = await getSql('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const token = crypto.randomBytes(24).toString('hex');
    const expires = Date.now() + 1000 * 60 * 60; // 1 hour
    await runSql('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, expires, user.id]);
    // send reset email
    const transporter = await getMailer();
    const resetUrl = `${process.env.APP_URL || `http://localhost:${PORT || 4000}`}/reset.html?token=${token}`;
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'no-reply@salon.local',
      to: email,
      subject: 'Password reset',
      text: `Reset your password: ${resetUrl}`,
      html: `<p>Reset your password by clicking <a href="${resetUrl}">this link</a>. The link expires in 1 hour.</p>`
    });
    if (nodemailer.getTestMessageUrl && info) {
      const url = nodemailer.getTestMessageUrl(info);
      if (url) console.log('Preview reset email at:', url);
    }
    res.json({ success: true, message: 'Password reset email sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Password reset: perform reset (token + new password)
app.post('/api/password-reset', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Missing fields' });
    const user = await getSql('SELECT * FROM users WHERE reset_token = ?', [token]);
    if (!user) return res.status(400).json({ error: 'Invalid token' });
    if (!user.reset_expires || Number(user.reset_expires) < Date.now()) return res.status(400).json({ error: 'Token expired' });
    const hash = await bcrypt.hash(password, 10);
    await runSql('UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [hash, user.id]);
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    // require auth to view bookings; return all for admin/staff, else only user's bookings
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'Missing Authorization' });
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid Authorization' });
    const token = parts[1];
    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
    const user = await getSql('SELECT * FROM users WHERE id = ?', [payload.id]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    let rows;
    if (user.role === 'admin' || user.role === 'staff') {
      rows = await allSql(
        `SELECT b.*, s.name as service_name, s.duration, s.price
         FROM bookings b
         LEFT JOIN services s ON b.service_id = s.id
         ORDER BY b.date, b.time`
      );
    } else {
      rows = await allSql(
        `SELECT b.*, s.name as service_name, s.duration, s.price
         FROM bookings b
         LEFT JOIN services s ON b.service_id = s.id
         WHERE b.user_id = ?
         ORDER BY b.date, b.time`,
        [user.id]
      );
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings', authMiddleware, requireVerified, async (req, res) => {
  try {
    const { name, phone, service_id, date, time } = req.body;
    if (!name || !service_id || !date || !time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existing = await getSql(
      'SELECT * FROM bookings WHERE date = ? AND time = ? AND service_id = ?',
      [date, time, service_id]
    );
    if (existing) return res.status(409).json({ error: 'Time slot already booked' });

    const result = await runSql(
      'INSERT INTO bookings (name,phone,service_id,date,time,created_at,user_id) VALUES (?,?,?,?,?,?,?)',
      [name, phone || '', service_id, date, time, new Date().toISOString(), req.user.id]
    );
    const id = result.lastID;
    const booking = await getSql('SELECT * FROM bookings WHERE id = ?', [id]);
    // broadcast update to SSE clients
    setImmediate(() => broadcastBookings());
    res.status(201).json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete handler now requires auth
app.delete('/api/bookings/:id', authMiddleware, requireVerified, async (req, res) => {
  try {
    const id = req.params.id;
    const booking = await getSql('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    // allow deletion if user is admin/staff or booking owner by name/email match
    const user = await getSql('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.role !== 'admin' && user.role !== 'staff') {
      // simple owner check: booking name matches user name
      if (booking.name !== user.name) return res.status(403).json({ error: 'Not allowed to delete this booking' });
    }
    await runSql('DELETE FROM bookings WHERE id = ?', [id]);
    setImmediate(() => broadcastBookings());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Note: deletion is handled above with auth checks

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
