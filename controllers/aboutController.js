import db from "../db.js";
import path from "path";
import fs from "fs";

// GET ABOUT
const getAbout = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM about_section WHERE id = 1"
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: "About section not found." });
    }

    res.json(rows[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE ABOUT
const updateAbout = async (req, res) => {
  try {

    const {
      name,
      happy_clients,
      photography_awards,
      social_media_followers,
      client_retention_rate
    } = req.body;

    // Get existing data first
    const [existingRows] = await db.query(
      "SELECT * FROM about_section WHERE id = 1"
    );

    if (existingRows.length === 0) {
      return res
        .status(404)
        .json({ error: "About section not found." });
    }

    const existing = existingRows[0];

    // Keep old image by default
    let image = existing.image;

    // If new image uploaded
    if (req.file) {

      image = `/uploads/${req.file.filename}`;

      // Delete old image
      if (existing.image) {

        const oldPath = path.join(
          process.cwd(),
          "public",
          existing.image
        );

        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
    }

    await db.execute(
      `
      UPDATE about_section 
      SET 
        name = ?,
        happy_clients = ?,
        photography_awards = ?,
        social_media_followers = ?,
        client_retention_rate = ?,
        image = ?
      WHERE id = 1
      `,
      [
        name || existing.name,
        happy_clients || existing.happy_clients,
        photography_awards || existing.photography_awards,
        social_media_followers || existing.social_media_followers,
        client_retention_rate || existing.client_retention_rate,
        image
      ]
    );

    res.json({
      success: true,
      message: "About section updated successfully"
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
};

export default {
  getAbout,
  updateAbout
};