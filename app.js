import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import heroVideoRoutes from './routes/heroVideoRoutes.js';
import clientVideoRoutes from './routes/clientVideoRoutes.js';
import testimonialRoutes from './routes/testimonialRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import contactMessageRoutes from './routes/contactMessageRoutes.js';
import aboutRoutes from './routes/aboutRoutes.js';
import photographyRoutes from './routes/photographyRoutes.js';
import cinematographyRoutes from './routes/cinematographyRoutes.js';
import loginRoutes from './routes/loginRoutes.js';
import serviceRoutes from './routes/serviceRoutes.js';
import galleryRoutes from './routes/galleryRoutes.js';
import footerImageRoutes from './routes/footerImageRoutes.js';
import photographyGalleryRoutes from './routes/photographygalleryRoutes.js';

dotenv.config();

const app = express();
// ✅ Allow only 3000 and 4000 for CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];


app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // if you want to allow cookies/authorization headers
  })
);
app.use(express.json());

app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));
app.use('/api/hero-video', heroVideoRoutes);
app.use('/api/client-videos', clientVideoRoutes);
app.use('/api/testimonials', testimonialRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/contact-messages', contactMessageRoutes);
app.use('/api/about', aboutRoutes);
app.use('/api/photography', photographyRoutes);
app.use('/api/cinematography', cinematographyRoutes);
app.use('/api/auth', loginRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/footerimage', footerImageRoutes);
app.use('/api/photographygallery', photographyGalleryRoutes);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads/services', express.static(path.join(__dirname, 'public/uploads/services')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app; 