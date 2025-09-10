import pool from '../db.js';

async function createUsersTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      phone VARCHAR(20) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL
    );
  `;
  try {
    const [result] = await pool.query(createTableQuery);
    console.log('Users table created or already exists.');
  } catch (error) {
    console.error('Error creating users table:', error);
  } finally {
    pool.end();
  }
}

createUsersTable(); 