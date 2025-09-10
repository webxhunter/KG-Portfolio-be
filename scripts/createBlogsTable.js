import pool from '../db.js';

const sql = `
CREATE TABLE IF NOT EXISTS blogs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  image VARCHAR(255) NOT NULL,
  date VARCHAR(50) NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL
)`;

(async () => {
  try {
    await pool.query(sql);
    console.log('Blogs table created!');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})(); 