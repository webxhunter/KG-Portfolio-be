import path from 'path';
import fs from 'fs';
import pool from '../db.js';

// GET: Get current client video (only one)
export const getClientVideo = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM client_videos ORDER BY id DESC LIMIT 1');
    if (rows.length === 0) return res.json(null);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch client video' });
  }
};

// POST: Upload or update client video (file)
export const uploadClientVideo = async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No video file uploaded' });

  try {
    // Remove old video if exists
    const [rows] = await pool.query('SELECT * FROM client_videos ORDER BY id DESC LIMIT 1');
    if (rows.length > 0) {
      const oldPath = path.join(process.cwd(), 'public', rows[0].url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      await pool.query('DELETE FROM client_videos');
    }
    // Save new video
    const videoPath = `/uploads/${file.filename}`;
    await pool.query('INSERT INTO client_videos (url) VALUES (?)', [videoPath]);
    res.json({ message: 'Client video updated', url: videoPath });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload client video' });
  }
}; 