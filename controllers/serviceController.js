import pool from '../db.js';
import path from 'path';
import fs from 'fs';

// Get all services with HLS path for videos
export const getServices = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM services');

    const transformed = rows.map(r => ({
      ...r,
      media_url: r.media_type === 'video' && r.media_url && r.media_url.endsWith('.m3u8')
        ? `hls/${path.basename(r.media_url, '.m3u8')}/${path.basename(r.media_url)}`
        : r.media_url
    }));

    res.json(transformed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateService = async (req, res) => {
  const { name } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  const mediaUrl = `/uploads/${name}/${req.file.filename}`;
  try {
    await pool.query(
      'UPDATE services SET media_type=?, media_url=? WHERE name=?',
      [mediaType, mediaUrl, name]
    );
    res.json({ success: true, mediaType, mediaUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// Get all services with their media positions
export const getServicePositions = async (req, res) => {
  try {
    const services = {
      'food': {
        hero: 'video',
        images: Array.from({length: 14}, (_, i) => `image${i+1}`)
      },
      'couple': {
        hero: 'video',
        images: Array.from({length: 10}, (_, i) => `image${i+1}`)
      },
      'brand_in_frame': {
        hero: 'video',
        images: Array.from({length: 7}, (_, i) => `image${i+1}`)
      },
      'revel_rhythm': {
        hero: 'video',
        images: Array.from({length: 11}, (_, i) => `image${i+1}`)
      },
      'frame_worthy': {
        hero: 'video',
        images: Array.from({length: 19}, (_, i) => `image${i+1}`)
      },
      'self_initiated_stories': {
          hero: 'video',
        images: Array.from({length: 9}, (_, i) => `image${i+1}`)
      }
    };

    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all media for a specific service
export const getServiceMedia = async (req, res) => {
  const { serviceName } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT id, position, media_type, file_path , video_hls_path FROM service_media WHERE service_name = ? ORDER BY position',
      [serviceName]
    );

    // Transform video paths to HLS format only
    const transformed = rows.map(r => ({
      ...r,
      file_path: r.media_type === 'video' && r.file_path && r.file_path.endsWith('.m3u8')
        ? `hls/${path.basename(r.file_path, '.m3u8')}/${path.basename(r.file_path)}`
        : r.file_path
    }));

    res.json(transformed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update media at specific position
export const updateServiceMedia = async (req, res) => {
  const { serviceName, position } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  const mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  const filePath = `/uploads/${serviceName}/${req.file.filename}`;
  
  try {
    // First check if media exists
    const [existing] = await pool.query(
      'SELECT id, file_path FROM service_media WHERE service_name = ? AND position = ?',
      [serviceName, position]
    );

    // Delete old file if exists
    if (existing.length > 0 && existing[0].file_path) {
      const oldFilePath = path.join(process.cwd(), 'public', existing[0].file_path);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    // Upsert media
    await pool.query(
      `INSERT INTO service_media (service_name, position, media_type, file_path)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         media_type = VALUES(media_type),
         file_path = VALUES(file_path),
         updated_at = NOW()`,
      [serviceName, position, mediaType, filePath]
    );

    // Return updated media list
    const [updatedMedia] = await pool.query(
      'SELECT id, position, media_type, file_path FROM service_media WHERE service_name = ? ORDER BY position',
      [serviceName]
    );
    
    res.json(updatedMedia);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete media at specific position
export const deleteServiceMedia = async (req, res) => {
  const { serviceName, position } = req.params;
  
  try {
    // Get media to delete
    const [media] = await pool.query(
      'SELECT id, file_path FROM service_media WHERE service_name = ? AND position = ?',
      [serviceName, position]
    );

    if (media.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Delete file from filesystem
    const filePath = path.join(process.cwd(), 'public', media[0].file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await pool.query(
      'DELETE FROM service_media WHERE id = ?',
      [media[0].id]
    );

    // Return updated media list
    const [updatedMedia] = await pool.query(
      'SELECT id, position, media_type, file_path FROM service_media WHERE service_name = ? ORDER BY position',
      [serviceName]
    );
    
    res.json(updatedMedia);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};