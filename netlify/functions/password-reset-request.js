const { init, getPool } = require('./lib/db');
const crypto = require('crypto');
const { getMailer } = require('./util/email');

exports.handler = async function(event) {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const { email } = JSON.parse(event.body || '{}');
    if (!email) return { statusCode: 400, body: JSON.stringify({ error: 'Missing email' }) };
    await init();
    const pool = getPool();
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = r.rows[0];
    if (!user) return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    const token = crypto.randomBytes(24).toString('hex');
    const expires = Date.now() + 1000*60*60; // 1 hour
    await pool.query('UPDATE users SET reset_token=$1, reset_expires=$2 WHERE id=$3', [token, expires, user.id]);
    const transporter = await getMailer();
    const resetUrl = `${process.env.APP_URL || ''}/reset.html?token=${token}`;
    await transporter.sendMail({ from: process.env.EMAIL_FROM || 'no-reply@salon.local', to: email, subject: 'Password reset', text: `Reset: ${resetUrl}`, html: `<p>Reset here: <a href="${resetUrl}">${resetUrl}</a></p>` });
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};