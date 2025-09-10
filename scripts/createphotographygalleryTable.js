import pool from '../db.js';

async function createPhotographyImageTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS photography_gallery_images (
      id INT PRIMARY KEY AUTO_INCREMENT,
      category VARCHAR(100) NOT NULL,
      image_url VARCHAR(255) NOT NULL,
      location VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(createTableQuery);
    console.log('photography_images table created or already exists.');
  } catch (err) {
    console.error('Error creating photography_images table:', err);
  } finally {
    process.exit();
  }
}

createPhotographyImageTable();