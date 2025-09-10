import pool from '../db.js';

const sql = `
CREATE TABLE IF NOT EXISTS cinematography_videos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(255) NOT NULL UNIQUE,
  video_url VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)`;

(async () => {
  try {
    await pool.query(sql);
    console.log('cinematography_videos table created!');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})(); 