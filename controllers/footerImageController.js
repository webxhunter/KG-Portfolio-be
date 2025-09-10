import pool from '../db.js';

// GET all footer images
export const getAllFooterImages = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM footer_images ORDER BY id ASC');

    const formattedRows = rows.map(row => ({
      id: row.id,
      image_url: row.image_url.replace(/^\/uploads\//, ''), 
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    res.json(formattedRows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// GET single footer image by ID
export const getFooterImageById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM footer_images WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Image not found' });

    const row = rows[0];
    res.json({
      id: row.id,
      image_url: row.image_url.replace(/^\/uploads\//, ''), 
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



// UPLOAD new footer image
export const uploadFooterImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image uploaded' });

  try {
    // Check if max 10 images reached
    const [countRows] = await pool.query('SELECT COUNT(*) as count FROM footer_images');
    if (countRows[0].count >= 10) {
      return res.status(400).json({ message: 'Maximum of 10 footer images allowed' });
    }

    const imageUrl = req.file.filename; 
    await pool.query('INSERT INTO footer_images (image_url) VALUES (?)', [imageUrl]);
    res.json({ message: 'Footer image uploaded successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// UPDATE footer image by ID
export const updateFooterImage = async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Check if image with given ID exists
    const [rows] = await pool.query('SELECT * FROM footer_images WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // 2. Check if file is uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    // 3. Update with new file
    const imageUrl = req.file.filename; 
    await pool.query(
      'UPDATE footer_images SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [imageUrl, id]
    );

    res.json({ message: 'Footer image updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// DELETE footer image by ID
export const deleteFooterImage = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM footer_images WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Image not found' });

    await pool.query('DELETE FROM footer_images WHERE id = ?', [id]);
    res.json({ message: 'Footer image deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};