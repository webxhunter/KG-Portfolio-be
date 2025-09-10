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
    const uniqueSuffix = Date.now();
    cb(null, 'client-video-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

router.get('/', getClientVideo);
router.post('/', upload.single('video'), uploadClientVideo);

export default router; 