const { init, getPool } = require('./lib/db');
const { sendVerification } = require('./util/email');

exports.handler = async function(event) {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const body = JSON.parse(event.body || '{}');
    const email = body.email;
    if (!email) return { statusCode: 400, body: JSON.stringify({ error: 'Missing email' }) };
    await init();
    const pool = getPool();
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = r.rows[0];
    if (!user) return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    if (user.verified) return { statusCode: 400, body: JSON.stringify({ error: 'User already verified' }) };
    const token = require('crypto').randomBytes(24).toString('hex');
    await pool.query('UPDATE users SET verify_token=$1 WHERE id=$2', [token, user.id]);
    sendVerification(email, token).catch(e=>console.error('email send error', e));
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};