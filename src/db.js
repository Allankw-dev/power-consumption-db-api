const { Pool } = require('pg');
require('dotenv').config();

// Connection pooling: reuses a small set of open connections instead of
// opening a new TCP/TLS handshake per request — this is the "efficient
// database connection" requirement from Task 3.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                     // max simultaneous connections in the pool
  idleTimeoutMillis: 30000,    // close idle clients after 30s
  connectionTimeoutMillis: 5000,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } // OCI managed PostgreSQL requires SSL
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

module.exports = pool;
