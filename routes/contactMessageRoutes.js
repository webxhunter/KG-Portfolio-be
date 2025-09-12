import express from "express";
import { saveContact, getContacts } from "../controllers/contactMessageController.js";

const router = express.Router();

router.post("/", saveContact);

router.get("/", getContacts);

export default router;