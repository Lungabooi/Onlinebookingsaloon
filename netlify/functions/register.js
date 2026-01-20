const { init, getPool } = require('./lib/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendVerification } = require('./util/email');

exports.handler = async function(event) {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const body = JSON.parse(event.body || '{}');
    const { name, email, password } = body;
    if (!name || !email || !password) return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
    await init();
    const pool = getPool();
    const hash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(24).toString('hex');
    try {
      await pool.query('INSERT INTO users (name,email,password,verify_token,verified,role,created_at) VALUES ($1,$2,$3,$4,false,$5,now())', [name, email, hash, token, 'customer']);
    } catch (e) {
      if (e.code === '23505') return { statusCode: 409, body: JSON.stringify({ error: 'Email already registered' }) };
      throw e;
    }
    // send verification async
    sendVerification(email, token).catch(err => console.error('email send error', err));
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};