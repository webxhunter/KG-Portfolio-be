import pool from '../db.js';

// GET all photography gallery images
export const getAllPhotographyGallery = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM photography_gallery ORDER BY id ASC');

    const formattedRows = rows.map(row => ({
      id: row.id,
      category: row.category,
      image_url: row.image_url.replace(/^\/uploads\//, ''), 
      location: row.location,
      video_hls_path:row.video_hls_path,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    res.json(formattedRows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// GET single photography gallery image by ID
export const getPhotographyGalleryById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM photography_gallery WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Image not found' });

    const row = rows[0];
    res.json({
      id: row.id,
      category: row.category,
      image_url: row.image_url.replace(/^\/uploads\//, ''), 
      location: row.location,
      video_hls_path:row.video_hls_path,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// UPLOAD new photography image
export const uploadPhotographyGallery = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  try {
    console.log(req)
    const { category, location } = req.body;
    if (!category || !location) return res.status(400).json({ message: 'Category and location are required' });

    const imageUrl = req.file.filename; 
    await pool.query(
      'INSERT INTO photography_gallery (category, image_url, location) VALUES (?, ?, ?)',
      [category, imageUrl, location]
    );
    res.json({ message: 'Photography image uploaded successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// UPDATE photography image by ID
export const updatePhotographyGallery = async (req, res) => {
  const { id } = req.params;

  try {
    // Check if record exists first
    const [rows] = await pool.query('SELECT * FROM photography_gallery WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Image not found' });

    // Check if file uploaded
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const { category, location } = req.body;
    if (!category || !location)
      return res.status(400).json({ message: 'Category and location are required' });

    const imageUrl = req.file.filename; 
    await pool.query(
      'UPDATE photography_gallery SET category = ?, image_url = ?, location = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [category, imageUrl, location, id]
    );

    res.json({ message: 'Photography gallery updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// DELETE photography image by ID
export const deletePhotographyGallery = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM photography_gallery WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Image not found' });

    await pool.query('DELETE FROM photography_gallery WHERE id = ?', [id]);
    res.json({ message: 'Photography image deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};