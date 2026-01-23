const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'vibeshot',
  password: process.env.DB_PASSWORD || 'vibeshotpassword123',
  database: process.env.DB_NAME || 'vibeshot',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection
pool.getConnection()
  .then(connection => {
    console.log('Worker: Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('Worker: Database connection failed:', err.message);
  });

module.exports = pool;
