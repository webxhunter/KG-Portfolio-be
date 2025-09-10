import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  getServicePositions,
  getServiceMedia,
  updateServiceMedia,
  deleteServiceMedia,
  getServices,
  updateService
} from '../controllers/serviceController.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Fix: support both :name and :serviceName param
    const serviceName = req.params.name || req.params.serviceName;
    const uploadPath = path.join(process.cwd(), 'public/uploads', serviceName);
    
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });
router.get('/', getServices);
router.post('/:name/media', upload.single('media'), updateService);

// Get all services with their positions
router.get('/positions', getServicePositions);

// Get media for a service
router.get('/:serviceName/media', getServiceMedia);

// Update media at position
router.post('/:serviceName/media/:position', upload.single('media'), updateServiceMedia);

// Delete media at position
router.delete('/:serviceName/media/:position', deleteServiceMedia);

export default router;