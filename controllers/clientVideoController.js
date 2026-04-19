// import path from 'path';
// import fs from 'fs';
// import pool from '../db.js';

// // GET: Get current client video (only one)
// export const getClientVideo = async (req, res) => {
//   try {
//     const [rows] = await pool.query(
//       'SELECT * FROM client_videos ORDER BY id DESC LIMIT 1'
//     );

//     if (rows.length === 0) return res.json(null);

//     const video = rows[0];

//     // Add dynamic HLS path
//     const transformed = {
//       ...video,
//       video_hls_path: video.video_hls_path
//         ? `hls/${path.basename(video.video_hls_path, '.m3u8')}/${path.basename(video.video_hls_path)}`
//         : null
//     };

//     res.json(transformed);
//   } catch (err) {
//     res.status(500).json({ error: 'Failed to fetch client video' });
//   }
// };

// // POST: Upload or update client video (file)
// export const uploadClientVideo = async (req, res) => {
//   const file = req.file;
//   if (!file) return res.status(400).json({ error: 'No video file uploaded' });

//   try {
//     // Remove old video if exists
//     const [rows] = await pool.query('SELECT * FROM client_videos ORDER BY id DESC LIMIT 1');
//     if (rows.length > 0) {
//       const oldPath = path.join(process.cwd(), 'public', rows[0].url);
//       if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
//       await pool.query('DELETE FROM client_videos');
//     }
//     // Save new video
//     const videoPath = `/uploads/${file.filename}`;
//     await pool.query('INSERT INTO client_videos (url) VALUES (?)', [videoPath]);
//     res.json({ message: 'Client video updated', url: videoPath });
//   } catch (err) {
//     res.status(500).json({ error: 'Failed to upload client video' });
//   }
// }; 

import path from 'path';
import fs from 'fs';
import pool from '../db.js';

// GET
export const getClientVideo = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM client_videos ORDER BY id DESC LIMIT 1'
    );

    if (!rows.length) return res.json(null);

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch client media' });
  }
};

// POST
export const uploadClientVideo = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  try {
    const [rows] = await pool.query(
      'SELECT * FROM client_videos ORDER BY id DESC LIMIT 1'
    );

    if (rows.length && rows[0].image_url) {
      const oldPath = path.join(process.cwd(), 'public', rows[0].image_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      await pool.query('DELETE FROM client_videos');
    }

    const imagePath = `/uploads/${req.file.filename}`;

    await pool.query(
      'INSERT INTO client_videos (image_url) VALUES (?)',
      [imagePath]
    );

    res.json({ message: 'Client image updated', imagePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};