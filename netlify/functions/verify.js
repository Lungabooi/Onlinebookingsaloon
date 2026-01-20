const { init, getPool } = require('./lib/db');

exports.handler = async function(event) {
  try {
    await init();
    const qs = event.queryStringParameters || {};
    const token = qs.token;
    if (!token) return { statusCode: 400, body: 'Missing token' };
    const pool = getPool();
    const r = await pool.query('SELECT * FROM users WHERE verify_token=$1', [token]);
    if (!r.rows[0]) return { statusCode: 400, body: 'Invalid token' };
    await pool.query('UPDATE users SET verified=true, verify_token=null WHERE id=$1', [r.rows[0].id]);
    return { statusCode: 200, body: 'Email verified' };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Server error' };
  }
};