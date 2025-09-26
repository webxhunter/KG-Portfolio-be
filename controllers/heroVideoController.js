import path from 'path';
import fs from 'fs';
import pool from '../db.js';

// GET: Get current hero video (only one)
export const getHeroVideo = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM hero_video ORDER BY id DESC LIMIT 1');
    if (rows.length === 0) return res.json(null);
    const row = rows[0];
    res.json({
      ...row,
      video_hls_path: row.video_hls_path && row.video_hls_path.endsWith('.m3u8')
        ? `hls/${path.basename(row.video_path, '.m3u8')}/${path.basename(row.video_path)}`
        : row.video_hls_path
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch hero video' });
  }
};

// POST: Upload or update hero video (file + description)
export const uploadHeroVideo = async (req, res) => {
  const description = req.body.description;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No video file uploaded' });

  try {
    // Remove old video if exists
    const [rows] = await pool.query('SELECT * FROM hero_video ORDER BY id DESC LIMIT 1');
    if (rows.length > 0) {
      const oldPath = path.join(process.cwd(), 'public', rows[0].video_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      await pool.query('DELETE FROM hero_video');
    }
    // Save new video
    const videoPath = `/uploads/${file.filename}`;
    await pool.query('INSERT INTO hero_video (video_path, description) VALUES (?, ?)', [videoPath, description]);
    res.json({ message: 'Hero video updated', videoPath, description });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload hero video' });
  }
}; 