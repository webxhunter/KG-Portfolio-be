// import express from 'express';
// import multer from 'multer';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import {
//   getGalleryByService,
//   addMedia,
//   updateMedia,
//   deleteMedia
// } from '../controllers/galleryController.js';

// const router = express.Router();

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Multer setup
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, path.join(__dirname, '../public/uploads/services'));
//   },
//   filename: function (req, file, cb) {
//     const ext = path.extname(file.originalname);
//     cb(null, file.fieldname + '-' + Date.now() + ext);
//   }
// });
// const upload = multer({ storage });

// // Get all media for a service
// router.get('/:service_name', getGalleryByService);
// // Add new media
// router.post('/', upload.single('file'), addMedia);
// // Update media
// router.put('/:id', upload.single('file'), updateMedia);
// // Delete media
// router.delete('/:id', deleteMedia);

// export default router; 

import express from 'express';
import multer from 'multer';
import path from 'path';
import db from '../db.js';

import {
  getGalleryByService,
  addMedia,
  updateMedia,
  deleteMedia
} from '../controllers/galleryController.js';

const router = express.Router();

// --------------------
// MULTER SETUP
// --------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), 'public/uploads/services'));
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image')) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  }
});

// --------------------
// ROUTES
// --------------------

// ✅ Get ALL gallery items
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM service_gallery');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get by service
router.get('/:service_name', getGalleryByService);

// ✅ Add
router.post('/', upload.single('image'), addMedia);

// ✅ Update
router.put('/:id', upload.single('image'), updateMedia);

// ✅ Delete
router.delete('/:id', deleteMedia);

export default router;