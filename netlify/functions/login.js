const { init, getPool } = require('./lib/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

exports.handler = async function(event) {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const { email, password } = JSON.parse(event.body || '{}');
    if (!email || !password) return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
    await init();
    const pool = getPool();
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = r.rows[0];
    if (!user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ token, name: user.name, verified: user.verified ? 1 : 0, email: user.email, role: user.role }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};