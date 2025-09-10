import db from "../db.js";
import path from "path";
import fs from "fs";

const getAbout = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM about_section WHERE id = 1");
    if (rows.length === 0)
      return res.status(404).json({ error: "About section not found." });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateAbout = async (req, res) => {
  try {
    const {
      name,
      happy_clients,
      photography_awards,
      social_media_followers,
      client_retention_rate,
    } = req.body;
    let image = req.file ? `/uploads/${req.file.filename}` : req.body.image;
    // If updating, delete old image if new one is uploaded
    if (req.file && req.body.oldImage && req.body.oldImage !== image) {
      const oldPath = path.join(process.cwd(), "public", req.body.oldImage);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const [result] = await db.execute(
      `UPDATE about_section SET name=?, happy_clients=?, photography_awards=?, social_media_followers=?, client_retention_rate=?, image=? WHERE id=1`,
      [
        name,
        happy_clients,
        photography_awards,
        social_media_followers,
        client_retention_rate,
        image,
      ]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "About section not found." });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { getAbout, updateAbout };
