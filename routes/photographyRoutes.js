import express from 'express';
import multer from 'multer';
import path from 'path';
import { upsertPhotographyImage, getAllPhotographyImages } from '../controllers/photographyController.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), 'public/uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, 'photography-' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

router.post('/upload', upload.single('image'), upsertPhotographyImage);
router.get('/', getAllPhotographyImages);

export default router; 