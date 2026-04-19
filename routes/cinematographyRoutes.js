import express from 'express';
import multer from 'multer';
import path from 'path';
import { 
  upsertCinematographyVideo, 
  getAllCinematographyVideos,
  addCinematographyVideo,
  getAllGalleryCinematographyVideos,
  updateCinematographyGalleryVideo,
  deleteCinematographyGalleryVideo 
} from '../controllers/cinematographyController.js';

const router = express.Router();

// Setup multer for file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // The destination folder for uploads
    cb(null, path.join(process.cwd(), 'public/uploads'));
  },
  filename: function (req, file, cb) {
    // Naming convention for uploaded files to ensure uniqueness
    cb(null, 'cinematography-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image')) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  }
});

// Route to add or update a video in the main 'cinematography_videos' table
router.post('/upload', upload.single('image'), upsertCinematographyVideo);

// Route to add a new video to the 'cinematography_gallery_video' table
router.post('/add', upload.single('image'), addCinematographyVideo);

// Route to get all videos from the main 'cinematography_videos' table
router.get('/', getAllCinematographyVideos);

// Route to get all videos from the 'cinematography_gallery_video' table
router.get('/gallery', getAllGalleryCinematographyVideos);

// Route to update a specific video in the 'cinematography_gallery_video' table by its ID
router.put('/gallery/:id', upload.single('image'), updateCinematographyGalleryVideo);

// Route to delete a specific video from the 'cinematography_gallery_video' table by its ID
router.delete('/gallery/:id', deleteCinematographyGalleryVideo);

export default router;
