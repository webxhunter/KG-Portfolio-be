import pool from '../db.js';

async function createServiceMediaTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS service_media (
      id INT PRIMARY KEY AUTO_INCREMENT,
      service_name VARCHAR(50) NOT NULL,
      media_type ENUM('image', 'video') NOT NULL,
      position VARCHAR(50) NOT NULL,
      file_path VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `;
  try {
    const [result] = await pool.query(createTableQuery);
    console.log('service_media table created or already exists.');
  } catch (err) {
    console.error('Error creating service_media table:', err);
  } finally {
    process.exit();
  }
}

createServiceMediaTable(); 