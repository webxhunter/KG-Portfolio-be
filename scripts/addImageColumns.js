import pool from '../db.js';

const queries = [
  `ALTER TABLE cinematography_videos ADD COLUMN image_url TEXT NULL`,
  `ALTER TABLE cinematography_gallery_video ADD COLUMN image_url TEXT NULL`,
  `ALTER TABLE client_videos ADD COLUMN image_url TEXT NULL`,
  `ALTER TABLE hero_video ADD COLUMN image_url TEXT NULL`,
  `ALTER TABLE services ADD COLUMN image_url TEXT NULL`,
  `ALTER TABLE service_media ADD COLUMN image_url TEXT NULL`
];

(async () => {
  try {
    for (const q of queries) {
      try {
        await pool.query(q);
        console.log('✅ Executed:', q);
      } catch (err) {
        console.log('⚠️ Skipped (maybe exists):', err.message);
      }
    }

    console.log('🎉 All tables updated!');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();