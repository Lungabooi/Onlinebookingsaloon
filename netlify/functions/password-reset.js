const { init, getPool } = require('./lib/db');
const bcrypt = require('bcryptjs');

exports.handler = async function(event) {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const { token, password } = JSON.parse(event.body || '{}');
    if (!token || !password) return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
    await init();
    const pool = getPool();
    const r = await pool.query('SELECT * FROM users WHERE reset_token=$1', [token]);
    const user = r.rows[0];
    if (!user) return { statusCode: 400, body: JSON.stringify({ error: 'Invalid token' }) };
    if (!user.reset_expires || Number(user.reset_expires) < Date.now()) return { statusCode: 400, body: JSON.stringify({ error: 'Token expired' }) };
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password=$1, reset_token=null, reset_expires=null WHERE id=$2', [hash, user.id]);
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};