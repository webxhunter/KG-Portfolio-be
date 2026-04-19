import express from 'express';
import multer from 'multer';
import path from 'path';
import { getClientVideo, uploadClientVideo } from '../controllers/clientVideoController.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, 'client-image-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image')) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  }
});

router.get('/', getClientVideo);
router.post('/', upload.single('image'), uploadClientVideo);

export default router; 