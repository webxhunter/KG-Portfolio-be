import pool from '../db.js';
import bcrypt from 'bcrypt';

export const registerUser = async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ message: 'Phone and password are required.' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (phone, password) VALUES (?, ?)', [phone, hashedPassword]);
    res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: 'Phone already registered.' });
    } else {
      res.status(500).json({ message: 'Registration failed.', error });
    }
  }
};

export const loginUser = async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ message: 'Phone and password are required.' });
  }
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone]);
    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid phone or password.' });
    }
    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid phone or password.' });
    }
    res.status(200).json({ message: 'Login successful.' });
  } catch (error) {
    res.status(500).json({ message: 'Login failed.', error });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, phone FROM users');
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users.', error });
  }
}; 