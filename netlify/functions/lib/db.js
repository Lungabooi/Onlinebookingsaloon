const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool;
function getPool() {
  if (pool) return pool;
  const conn = process.env.DATABASE_URL;
  if (!conn) throw new Error('Missing DATABASE_URL');
  pool = new Pool({ connectionString: conn, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false });
  return pool;
}

async function init() {
  const p = getPool();
  // Create tables if they don't exist
  await p.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    verified BOOLEAN DEFAULT false,
    verify_token TEXT,
    role TEXT DEFAULT 'customer',
    reset_token TEXT,
    reset_expires BIGINT
  )`);

  await p.query(`CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    duration INTEGER,
    price NUMERIC
  )`);

  await p.query(`CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    service_id INTEGER REFERENCES services(id),
    date DATE,
    time TEXT,
    created_at TIMESTAMP DEFAULT now(),
    user_id INTEGER REFERENCES users(id)
  )`);

  // Seed services if empty
  const r = await p.query('SELECT COUNT(*)::int as cnt FROM services');
  if (r.rows[0].cnt === 0) {
    await p.query("INSERT INTO services (name,duration,price) VALUES ($1,$2,$3)", ['Haircut', 30, 25.0]);
    await p.query("INSERT INTO services (name,duration,price) VALUES ($1,$2,$3)", ['Beard Trim', 15, 12.0]);
    await p.query("INSERT INTO services (name,duration,price) VALUES ($1,$2,$3)", ['Hair Coloring', 90, 80.0]);
  }
}

module.exports = { getPool, init };
