import db from '../db.js';

const getAllMessages = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createMessage = async (req, res) => {
  const { first_name, last_name, email, phone, message } = req.body;
  if (!first_name || !last_name || !email || !phone || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    const [result] = await db.execute(
      'INSERT INTO contact_messages (first_name, last_name, email, phone, message) VALUES (?, ?, ?, ?, ?)',
      [first_name, last_name, email, phone, message]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteMessage = async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.execute('DELETE FROM contact_messages WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Message not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default {
  getAllMessages,
  createMessage,
  deleteMessage
}; 