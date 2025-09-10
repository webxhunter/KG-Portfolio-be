import pool from '../db.js';
import path from 'path';

export const createBlog = async (req, res) => {
  try {
    const { date, question, answer } = req.body;
    const image = req.file ? req.file.filename : null;
    if (!image) return res.status(400).json({ error: 'Image is required' });
    const sql = 'INSERT INTO blogs (image, date, question, answer) VALUES (?, ?, ?, ?)';
    await pool.query(sql, [image, date, question, answer]);
    res.status(201).json({ message: 'Blog created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getBlogs = async (req, res) => {
  try {
    const [results] = await pool.query('SELECT * FROM blogs ORDER BY id DESC');
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getBlog = async (req, res) => {
  try {
    const [results] = await pool.query('SELECT * FROM blogs WHERE id = ?', [req.params.id]);
    if (results.length === 0) return res.status(404).json({ error: 'Blog not found' });
    res.json(results[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateBlog = async (req, res) => {
  try {
    const { date, question, answer } = req.body;
    let sql, params;
    if (req.file) {
      const image = req.file.filename;
      sql = 'UPDATE blogs SET image=?, date=?, question=?, answer=? WHERE id=?';
      params = [image, date, question, answer, req.params.id];
    } else {
      sql = 'UPDATE blogs SET date=?, question=?, answer=? WHERE id=?';
      params = [date, question, answer, req.params.id];
    }
    await pool.query(sql, params);
    res.json({ message: 'Blog updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteBlog = async (req, res) => {
  try {
    await pool.query('DELETE FROM blogs WHERE id=?', [req.params.id]);
    res.json({ message: 'Blog deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}; 