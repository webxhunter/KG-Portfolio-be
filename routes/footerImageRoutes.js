import express from 'express';
import multer from 'multer';
import path from 'path';
import {
  getAllFooterImages,
  getFooterImageById,
  uploadFooterImage,
  updateFooterImage,
  deleteFooterImage,
} from '../controllers/footerImageController.js';

const router = express.Router();

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'public/uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, 'footer-' + Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Routes
router.get('/', getAllFooterImages);           
router.get('/:id', getFooterImageById);           
router.post('/upload', upload.single('file'), uploadFooterImage); 
router.put('/:id', upload.single('file'), updateFooterImage);     
router.delete('/:id', deleteFooterImage);         

export default router;