import pool from '../db.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Add or update video for a category (for the main cinematography_videos table)
export const upsertCinematographyVideo = async (req, res) => {
  try {
    const { category, location } = req.body;
    const video = req.file ? req.file.filename : null;
    if (!video || !category) return res.status(400).json({ message: 'Category and video are required.' });

    const [rows] = await pool.query('SELECT * FROM cinematography_videos WHERE category = ?', [category]);
    if (rows.length > 0) {
      const oldPath = path.join(process.cwd(), 'public/uploads', rows[0].video_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      await pool.query('UPDATE cinematography_videos SET video_url = ?, location = ? WHERE category = ?', [video, location, category]);
      return res.json({ message: 'Video updated successfully' });
    } else {
      await pool.query('INSERT INTO cinematography_videos (category, video_url, location) VALUES (?, ?, ?)', [category, video, location]);
      return res.status(201).json({ message: 'Video added successfully' });
    }
  } catch (err) {
    res.status(500).json({ message: 'DB Error', error: err.message });
  }
};

// Add new video for a category (for the cinematography_gallery_video table)
export const addCinematographyVideo = async (req, res) => {
  try {
    const { category, location } = req.body;
    const video = req.file ? req.file.filename : null;

    if (!video || !category) {
      return res.status(400).json({ message: 'Category and video are required.' });
    }

    await pool.query('INSERT INTO cinematography_gallery_video (category, video_url, location) VALUES (?, ?, ?)',
      [category, video, location]);

    return res.status(201).json({ message: 'Video added successfully' });

  } catch (err) {
    res.status(500).json({ message: 'DB Error', error: err.message });
  }
};



// Get all videos from cinematography_videos (for frontend)
export const getAllCinematographyVideos = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM cinematography_videos');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'DB Error', error: err.message });
  }
};

// Get all videos from cinematography_gallery_video (for frontend)
export const getAllGalleryCinematographyVideos = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM cinematography_gallery_video');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'DB Error', error: err.message });
  }
};

// Update a video in the cinematography_gallery_video table
export const updateCinematographyGalleryVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const { category, location } = req.body;
    const newVideoFile = req.file ? req.file.filename : null;

    if (!category && !location && !newVideoFile) {
      return res.status(400).json({ message: 'No update information provided.' });
    }

    const [existingVideoRows] = await pool.query('SELECT * FROM cinematography_gallery_video WHERE id = ?', [id]);

    if (existingVideoRows.length === 0) {
      // If the video doesn't exist, remove the uploaded file if there is one
      if (newVideoFile) {
        const tempPath = path.join(process.cwd(), 'public/uploads', newVideoFile);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
      return res.status(404).json({ message: 'Video not found.' });
    }

    const oldVideoUrl = existingVideoRows[0].video_url;

    // If a new video is uploaded, delete the old one
    if (newVideoFile) {
      const oldPath = path.join(process.cwd(), 'public/uploads', oldVideoUrl);
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch (fileErr) {
          console.error("Error deleting old file:", fileErr.message);
        }
      }
    }

    // Prepare new values, using existing ones as fallbacks
    const video_url_to_update = newVideoFile || oldVideoUrl;
    const category_to_update = category || existingVideoRows[0].category;
    const location_to_update = location || existingVideoRows[0].location;

    await pool.query(
      'UPDATE cinematography_gallery_video SET category = ?, location = ?, video_url = ? WHERE id = ?',
      [category_to_update, location_to_update, video_url_to_update, id]
    );

    res.json({ message: 'Video updated successfully' });

  } catch (err) {
    res.status(500).json({ message: 'DB Error', error: err.message });
  }
};

// Delete a video from the cinematography_gallery_video table
export const deleteCinematographyGalleryVideo = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the video record to get the filename
    const [rows] = await pool.query('SELECT * FROM cinematography_gallery_video WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Video not found.' });
    }

    const videoUrl = rows[0].video_url;
    const videoPath = path.join(process.cwd(), 'public/uploads', videoUrl);

    // Delete the physical file from the server
    if (fs.existsSync(videoPath)) {
      try {
        fs.unlinkSync(videoPath);
      } catch (fileErr) {
        console.error("Error deleting file:", fileErr.message);
        // We can choose to continue and delete the DB record anyway
      }
    }

    // Delete the record from the database
    await pool.query('DELETE FROM cinematography_gallery_video WHERE id = ?', [id]);

    res.json({ message: 'Video deleted successfully' });

  } catch (err) {
    res.status(500).json({ message: 'DB Error', error: err.message });
  }
};

