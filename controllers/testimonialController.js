import pool from '../db.js';

// Get all testimonials
export const getTestimonials = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM testimonials ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
};

// Add a testimonial
export const addTestimonial = async (req, res) => {
  const { client_name, location, star_rating, review, instagram_link } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO testimonials (client_name, location, star_rating, review, instagram_link) VALUES (?, ?, ?, ?, ?)',
      [client_name, location, star_rating, review, instagram_link]
    );
    res.status(201).json({ id: result.insertId, client_name, location, star_rating, review, instagram_link });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add testimonial' });
  }
};

// Update a testimonial
export const updateTestimonial = async (req, res) => {
  const { id } = req.params;
  const { client_name, location, star_rating, review, instagram_link } = req.body;
  try {
    await pool.query(
      'UPDATE testimonials SET client_name=?, location=?, star_rating=?, review=?, instagram_link=? WHERE id=?',
      [client_name, location, star_rating, review, instagram_link, id]
    );
    res.json({ id, client_name, location, star_rating, review, instagram_link });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update testimonial' });
  }
};

// Delete a testimonial
export const deleteTestimonial = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM testimonials WHERE id=?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete testimonial' });
  }
}; 