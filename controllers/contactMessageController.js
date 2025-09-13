import db from "../db.js";
import nodemailer from "nodemailer";

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Save contact message
export const saveContact = async (req, res) => {
  const { first_name, last_name, email, phone, message } = req.body;

  if (!first_name)
    return res.status(400).json({ message: "Please provide first name" });
  if (!last_name)
    return res.status(400).json({ message: "Please provide last name" });
  if (!email) return res.status(400).json({ message: "Please provide email" });
  if (!phone) return res.status(400).json({ message: "Please provide phone" });
  if (!message)
    return res.status(400).json({ message: "Please provide message" });

  try {
    await db.query(
      `
      INSERT INTO contact_messages 
      (first_name, last_name, email, phone, message) 
      VALUES (?, ?, ?, ?, ?)
      `,
      [first_name, last_name, email, phone, message]
    );

    res.status(200).json({ message: "Message sent successfully!" });

    // Send styled email in background
    transporter
      .sendMail({
        from: `"Website Contact" <${process.env.EMAIL_USER}>`,
        to: process.env.ADMIN_EMAIL,
        subject: "New Contact Message",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
            <div style="background: #00aef0; color: white; text-align: center; padding: 15px; font-size: 18px; font-weight: bold;">
              SENT MAAZ A MESSAGE
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
              <p><strong>Name:</strong> ${first_name} ${last_name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Phone:</strong> ${phone}</p>
              <p><strong>Message:</strong></p>
              <p style="background: #fff; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                ${message}
              </p>
            </div>
            <div style="background: #f1f1f1; text-align: center; padding: 10px; font-size: 12px; color: #555;">
              This message was sent from your website contact form.
            </div>
          </div>
        `,
      })
      .catch((err) => console.error("Error sending email:", err));
  } catch (err) {
    console.error("Error saving contact:", err);
    res.status(500).json({ message: "Error occurred while saving message" });
  }
};

// Get all contact messages
export const getContacts = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM contact_messages ORDER BY created_at DESC"
    );

    if (rows.length === 0) {
      return res.status(200).json({ message: "No contact messages found" });
    }

    res.status(200).json({ data: rows });
  } catch (err) {
    console.error("Error fetching contacts:", err);
    res.status(500).json({ message: "Error occurred while fetching messages" });
  }
};
