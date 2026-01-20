const { init, getPool } = require('./lib/db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

function parseAuth(event) {
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  if (!auth) return null;
  const parts = auth.split(' ');
  if (parts.length!==2) return null;
  try { return jwt.verify(parts[1], JWT_SECRET); } catch (e) { return null; }
}

exports.handler = async function(event) {
  try {
    await init();
    const pool = getPool();
    const method = event.httpMethod;
    if (method === 'GET') {
      const user = parseAuth(event);
      if (!user) return { statusCode: 401, body: JSON.stringify({ error: 'Missing Authorization' }) };
      const ures = await pool.query('SELECT role FROM users WHERE id=$1', [user.id]);
      const role = ures.rows[0] && ures.rows[0].role;
      let res;
      if (role === 'admin' || role === 'staff') {
        res = await pool.query('SELECT b.*, s.name as service_name, s.duration, s.price FROM bookings b LEFT JOIN services s ON b.service_id = s.id ORDER BY b.date, b.time');
      } else {
        res = await pool.query('SELECT b.*, s.name as service_name, s.duration, s.price FROM bookings b LEFT JOIN services s ON b.service_id = s.id WHERE b.user_id=$1 ORDER BY b.date, b.time', [user.id]);
      }
      return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(res.rows) };
    }
    if (method === 'POST') {
      const user = parseAuth(event);
      if (!user) return { statusCode: 401, body: JSON.stringify({ error: 'Missing Authorization' }) };
      const body = JSON.parse(event.body || '{}');
      const { name, phone, service_id, date, time } = body;
      if (!name || !service_id || !date || !time) return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
      // ensure verified
      const ures = await pool.query('SELECT verified FROM users WHERE id=$1', [user.id]);
      if (!ures.rows[0] || !ures.rows[0].verified) return { statusCode: 403, body: JSON.stringify({ error: 'Email not verified' }) };
      const existing = await pool.query('SELECT * FROM bookings WHERE date=$1 AND time=$2 AND service_id=$3', [date, time, service_id]);
      if (existing.rows[0]) return { statusCode: 409, body: JSON.stringify({ error: 'Time slot already booked' }) };
      const r = await pool.query('INSERT INTO bookings (name,phone,service_id,date,time,created_at,user_id) VALUES ($1,$2,$3,$4,$5,now(),$6) RETURNING id', [name, phone||'', service_id, date, time, user.id]);
      return { statusCode: 201, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ id: r.rows[0].id }) };
    }
    if (method === 'DELETE') {
      const user = parseAuth(event);
      if (!user) return { statusCode: 401, body: JSON.stringify({ error: 'Missing Authorization' }) };
      const qs = event.queryStringParameters || {};
      const id = qs.id;
      if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };
      const booking = await pool.query('SELECT * FROM bookings WHERE id=$1', [id]);
      if (!booking.rows[0]) return { statusCode: 404, body: JSON.stringify({ error: 'Booking not found' }) };
      const ures = await pool.query('SELECT role FROM users WHERE id=$1', [user.id]);
      const role = ures.rows[0] && ures.rows[0].role;
      if (role !== 'admin' && role !== 'staff') {
        if (booking.rows[0].user_id !== user.id) return { statusCode: 403, body: JSON.stringify({ error: 'Not allowed to delete this booking' }) };
      }
      await pool.query('DELETE FROM bookings WHERE id=$1', [id]);
      return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ success: true }) };
    }
    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};