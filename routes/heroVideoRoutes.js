// import express from 'express';
// import { getHeroVideo, uploadHeroVideo } from '../controllers/heroVideoController.js';
// import multer from 'multer';
// import path from 'path';
// import fs from 'fs';

// const router = express.Router();

// // Ensure uploads directory exists
// const uploadsDir = path.join(process.cwd(), 'public/uploads');
// if (!fs.existsSync(uploadsDir)) {
//   fs.mkdirSync(uploadsDir, { recursive: true });
// }

// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, path.join(process.cwd(), 'public/uploads'));
//   },
//   filename: function (req, file, cb) {
//     cb(null, 'hero-video-' + Date.now() + path.extname(file.originalname));
//   }
// });
// const upload = multer({ storage: storage });

// router.get('/', getHeroVideo);
// router.post('/', upload.single('video'), uploadHeroVideo);

// export default router; 

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getHeroVideo, uploadHeroVideo } from '../controllers/heroVideoController.js';

const router = express.Router();

const uploadsDir = path.join(process.cwd(), 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, 'hero-image-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image')) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  }
});

// 🔁 CHANGED
router.get('/', getHeroVideo);
router.post('/', upload.single('image'), uploadHeroVideo);

export default router;