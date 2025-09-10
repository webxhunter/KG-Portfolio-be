import pool from '../db.js';

async function createTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS testimonials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_name VARCHAR(100) NOT NULL,
      location VARCHAR(100) NOT NULL,
      star_rating INT NOT NULL CHECK (star_rating >= 1 AND star_rating <= 5),
      review TEXT NOT NULL,
      instagram_link VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `;
  try {
    await pool.query(sql);
    console.log('Testimonials table created or already exists.');
    process.exit(0);
  } catch (err) {
    console.error('Error creating testimonials table:', err);
    process.exit(1);
  }
}

createTable(); 