import pool from '../db.js';
import path from 'path';
import fs from 'fs';

// Add or update image for a category
export const upsertPhotographyImage = async (req, res) => {
  try {
    const { category } = req.body;
    const image = req.file ? req.file.filename : null;
    if (!image || !category) return res.status(400).json({ message: 'Category and image are required.' });

    // Check if category already exists
    const [rows] = await pool.query('SELECT * FROM photography_images WHERE category = ?', [category]);
    if (rows.length > 0) {
      // Delete old image file
      const oldPath = path.join(process.cwd(), 'public/uploads', rows[0].image_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      // Update
      await pool.query('UPDATE photography_images SET image_url = ? WHERE category = ?', [image, category]);
      return res.json({ message: 'Image updated successfully' });
    } else {
      // Insert
      await pool.query('INSERT INTO photography_images (category, image_url) VALUES (?, ?)', [category, image]);
      return res.status(201).json({ message: 'Image added successfully' });
    }
  } catch (err) {
    res.status(500).json({ message: 'DB Error', error: err.message });
  }
};

// Get all images (for frontend)
export const getAllPhotographyImages = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM photography_images');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'DB Error', error: err.message });
  }
}; 