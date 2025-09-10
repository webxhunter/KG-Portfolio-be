import express from 'express';
import { getTestimonials, addTestimonial, updateTestimonial, deleteTestimonial } from '../controllers/testimonialController.js';

const router = express.Router();

router.get('/', getTestimonials);
router.post('/', addTestimonial);
router.put('/:id', updateTestimonial);
router.delete('/:id', deleteTestimonial);

export default router; 