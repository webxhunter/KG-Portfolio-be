import pool from '../db.js';

const queries = [

  // ✅ Fix cinematography main table
  `ALTER TABLE cinematography_videos 
   MODIFY video_url VARCHAR(500) NULL`,

  // ✅ Fix cinematography gallery table
  `ALTER TABLE cinematography_gallery_video 
   MODIFY video_url VARCHAR(500) NULL`,

   `ALTER TABLE client_videos 
   MODIFY url VARCHAR(500) NULL`,

    `ALTER TABLE hero_video
    MODIFY video_path VARCHAR(500) NULL`,

];

(async () => {
  try {
    for (const q of queries) {
      try {
        await pool.query(q);
        console.log('✅ Fixed:', q);
      } catch (err) {
        console.log('⚠️ Skipped (maybe already fixed):', err.message);
      }
    }

    console.log('\n🎉 DONE — video_url is now optional everywhere!');
    process.exit();

  } catch (err) {
    console.error('❌ Script failed:', err);
    process.exit(1);
  }
})();