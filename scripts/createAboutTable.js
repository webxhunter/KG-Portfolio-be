const db = require('../db');

db.run(`
  CREATE TABLE IF NOT EXISTS about_section (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    happy_clients VARCHAR(255) NOT NULL,
    photography_awards VARCHAR(255) NOT NULL,
    social_media_followers VARCHAR(255) NOT NULL,
    client_retention_rate VARCHAR(255) NOT NULL,
    image VARCHAR(255),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Failed to create about_section table:', err.message);
  } else {
    console.log('about_section table created or already exists.');
  }
  db.close();
}); 