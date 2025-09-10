import pool from '../db.js';

const sql = `
CREATE TABLE IF NOT EXISTS photography_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(255) NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)`;

(async () => {
  try {
    await pool.query(sql);
    console.log('photography_images table created!');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})(); 