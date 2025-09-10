import express from 'express';
import contactMessageController from '../controllers/contactMessageController.js';

const router = express.Router();

router.get('/', contactMessageController.getAllMessages);
router.post('/', contactMessageController.createMessage);
router.delete('/:id', contactMessageController.deleteMessage);

export default router; 