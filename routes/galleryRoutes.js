import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getGalleryByService,
  addMedia,
  updateMedia,
  deleteMedia
} from '../controllers/galleryController.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../public/uploads/services'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + Date.now() + ext);
  }
});
const upload = multer({ storage });

// Get all media for a service
router.get('/:service_name', getGalleryByService);
// Add new media
router.post('/', upload.single('file'), addMedia);
// Update media
router.put('/:id', upload.single('file'), updateMedia);
// Delete media
router.delete('/:id', deleteMedia);

export default router; 