import express from 'express';
import multer from 'multer';
import path from 'path';
import {
  getAllPhotographyGallery,
  getPhotographyGalleryById,
  uploadPhotographyGallery,
  updatePhotographyGallery,
  deletePhotographyGallery,
} from '../controllers/photographygalleryController.js';

const router = express.Router();

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'public/uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, 'photography-' + Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

router.get('/', getAllPhotographyGallery);
router.get('/:id', getPhotographyGalleryById);
router.post('/upload', upload.single('file'), uploadPhotographyGallery);
router.put('/:id', upload.single('file'), updatePhotographyGallery);
router.delete('/:id', deletePhotographyGallery);
       

export default router;