// import db from '../db.js';
// import path from 'path';
// import fs from 'fs';
// import { fileURLToPath } from 'url';

// // Get all media for a service
// export const getGalleryByService = async (req, res) => {
//   const { service_name } = req.params;
//   try {
//     const [rows] = await db.query('SELECT * FROM service_gallery WHERE service_name = ? ORDER BY is_main_video DESC, created_at DESC', [service_name]);
//     // inside getGalleryByService
// res.json(rows.map(r => ({
//   ...r,
//   url: r.url && r.url.endsWith('.m3u8')
//     ? `hls/${path.basename(r.url, '.m3u8')}/${path.basename(r.url)}`
//     : r.url
// })));
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Add new media (image/video)
// export const addMedia = async (req, res) => {
//   const { service_name, type, title, is_main_video } = req.body;
//   const file = req.file;
//   if (!file) return res.status(400).json({ error: 'File is required' });
//   try {
//     let url = `/uploads/services/${file.filename}`;
//     // If is_main_video is true, unset previous main video for this service
//     if (is_main_video === 'true' || is_main_video === true) {
//       await db.query('UPDATE service_gallery SET is_main_video = 0 WHERE service_name = ?', [service_name]);
//     }
//     await db.query(
//       'INSERT INTO service_gallery (service_name, type, url, title, is_main_video) VALUES (?, ?, ?, ?, ?)',
//       [service_name, type, url, title, is_main_video === 'true' || is_main_video === true ? 1 : 0]
//     );
//     res.json({ message: 'Media added successfully' });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Update media (title, is_main_video, file)
// export const updateMedia = async (req, res) => {
//   const { id } = req.params;
//   const { title, is_main_video } = req.body;
//   const file = req.file;
//   try {
//     let updateFields = [];
//     let params = [];
//     if (title) {
//       updateFields.push('title = ?');
//       params.push(title);
//     }
//     if (typeof is_main_video !== 'undefined') {
//       // Unset previous main video for this service
//       if (is_main_video === 'true' || is_main_video === true) {
//         const [row] = await db.query('SELECT service_name FROM service_gallery WHERE id = ?', [id]);
//         if (row.length) {
//           await db.query('UPDATE service_gallery SET is_main_video = 0 WHERE service_name = ?', [row[0].service_name]);
//         }
//       }
//       updateFields.push('is_main_video = ?');
//       params.push(is_main_video === 'true' || is_main_video === true ? 1 : 0);
//     }
//     if (file) {
//       updateFields.push('url = ?');
//       params.push(`/uploads/services/${file.filename}`);
//     }
//     if (updateFields.length === 0) return res.status(400).json({ error: 'No fields to update' });
//     params.push(id);
//     await db.query(`UPDATE service_gallery SET ${updateFields.join(', ')} WHERE id = ?`, params);
//     res.json({ message: 'Media updated successfully' });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Delete media
// export const deleteMedia = async (req, res) => {
//   const { id } = req.params;
//   try {
//     // Get file url to delete from disk
//     const [rows] = await db.query('SELECT url FROM service_gallery WHERE id = ?', [id]);
//     if (rows.length && rows[0].url) {
//       const __filename = fileURLToPath(import.meta.url);
//       const __dirname = path.dirname(__filename);
//       const filePath = path.join(__dirname, '../public', rows[0].url);
//       if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
//     }
//     await db.query('DELETE FROM service_gallery WHERE id = ?', [id]);
//     res.json({ message: 'Media deleted successfully' });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// }; 

import db from '../db.js';
import path from 'path';
import fs from 'fs';

// GET
export const getGalleryByService = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM service_gallery WHERE service_name = ? ORDER BY is_main_video DESC, created_at DESC',
      [req.params.service_name]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ADD
export const addMedia = async (req, res) => {
  const { service_name, title, is_main_video } = req.body;
  if (!req.file) return res.status(400).json({ error: 'File required' });

  try {
    const url = `/uploads/services/${req.file.filename}`;

    if (is_main_video) {
      await db.query(
        'UPDATE service_gallery SET is_main_video = 0 WHERE service_name = ?',
        [service_name]
      );
    }

    await db.query(
      'INSERT INTO service_gallery (service_name, type, url, title, is_main_video) VALUES (?, ?, ?, ?, ?)',
      [service_name, 'image', url, title, is_main_video ? 1 : 0]
    );

    res.json({ message: 'Media added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE
export const updateMedia = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.query(
      'SELECT * FROM service_gallery WHERE id = ?',
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    let fields = [];
    let values = [];

    if (req.body.title) {
      fields.push('title=?');
      values.push(req.body.title);
    }

    if (typeof req.body.is_main_video !== 'undefined') {
      fields.push('is_main_video=?');
      values.push(req.body.is_main_video ? 1 : 0);
    }

    if (req.file) {
      if (rows[0].url) {
        const oldPath = path.join(process.cwd(), 'public', rows[0].url);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      fields.push('url=?');
      values.push(`/uploads/services/${req.file.filename}`);
    }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    values.push(id);

    await db.query(
      `UPDATE service_gallery SET ${fields.join(', ')} WHERE id=?`,
      values
    );

    res.json({ message: 'Updated' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE
export const deleteMedia = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT url FROM service_gallery WHERE id=?',
      [req.params.id]
    );

    if (rows.length && rows[0].url) {
      const filePath = path.join(process.cwd(), 'public', rows[0].url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await db.query('DELETE FROM service_gallery WHERE id=?', [req.params.id]);

    res.json({ message: 'Deleted' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};