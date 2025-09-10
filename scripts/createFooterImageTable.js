import pool from '../db.js';

async function createFooterImageTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS footer_images (
      id INT PRIMARY KEY AUTO_INCREMENT,
      image_url VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(createTableQuery);
    console.log('footer_images table created or already exists.');
  } catch (err) {
    console.error('Error creating footer_images table:', err);
  } finally {
    process.exit();
  }
}

createFooterImageTable();