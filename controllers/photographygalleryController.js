import pool from '../db.js';
import path from 'path';
import fs from 'fs';

// GET ALL
export const getAllPhotographyGallery = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM photography_gallery ORDER BY id ASC');

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET ONE
export const getPhotographyGalleryById = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM photography_gallery WHERE id=?',
      [req.params.id]
    );

    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// UPLOAD
export const uploadPhotographyGallery = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file' });

  const { category, location } = req.body;

  await pool.query(
    'INSERT INTO photography_gallery (category, image_url, location) VALUES (?, ?, ?)',
    [category, req.file.filename, location]
  );

  res.json({ message: 'Uploaded' });
};

// UPDATE
export const updatePhotographyGallery = async (req, res) => {
  const { id } = req.params;

  const [rows] = await pool.query(
    'SELECT * FROM photography_gallery WHERE id=?',
    [id]
  );

  if (!rows.length) return res.status(404).json({ message: 'Not found' });

  if (rows[0].image_url) {
    const oldPath = path.join(process.cwd(), 'public/uploads', rows[0].image_url);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  await pool.query(
    'UPDATE photography_gallery SET category=?, image_url=?, location=? WHERE id=?',
    [req.body.category, req.file.filename, req.body.location, id]
  );

  res.json({ message: 'Updated' });
};

// DELETE
export const deletePhotographyGallery = async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM photography_gallery WHERE id=?',
    [req.params.id]
  );

  if (rows.length && rows[0].image_url) {
    const filePath = path.join(process.cwd(), 'public/uploads', rows[0].image_url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await pool.query('DELETE FROM photography_gallery WHERE id=?', [req.params.id]);

  res.json({ message: 'Deleted' });
};