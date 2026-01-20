const { init, getPool } = require('./lib/db');

exports.handler = async function(event) {
  try {
    await init();
    const pool = getPool();
    const res = await pool.query('SELECT id, name, duration, price FROM services ORDER BY id');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(res.rows)
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};