import db from "../db.js";
import fs from "fs";
import path from "path";
import { findFileByNameInsensitive } from "./fileFinder.js";
import convertToHls from "./hlsconvert.js";

const HLS_DIR = path.join(process.cwd(), "public/hls");
const UPLOADS_DIR = path.join(process.cwd(), "public/uploads");
const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm)$/i;

// 🕒 Timestamped log
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// ✅ Validate HLS integrity (all segments must exist)
function validateHls(outputDir, resolution = null) {
  const playlistName = resolution
    ? `${path.basename(outputDir)}_${resolution}p.m3u8`
    : `${path.basename(outputDir)}.m3u8`;
  const indexPath = path.join(outputDir, playlistName);

  if (!fs.existsSync(indexPath)) return false;

  try {
    const playlist = fs.readFileSync(indexPath, "utf-8");
    const lines = playlist
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("#"));

    if (lines.length === 0) return false;

    for (const segment of lines) {
      const segmentPath = path.join(outputDir, segment);
      if (!fs.existsSync(segmentPath)) {
        log(`⚠️ Missing segment: ${segmentPath}`);
        return false;
      }
    }

    return true;
  } catch (err) {
    log(`⚠️ HLS validation error: ${err.message}`);
    return false;
  }
}

// Check if HLS exists for a given resolution
function hlsExists(outputDir, resolution = null) {
  const playlistName = resolution
    ? `${path.basename(outputDir)}_${resolution}p.m3u8`
    : `${path.basename(outputDir)}.m3u8`;
  return fs.existsSync(path.join(outputDir, playlistName));
}

async function processRow(table, row, column) {
  try {
    const dbPath = row[column];
    if (!dbPath || !VIDEO_EXT.test(dbPath)) return;

    const fileName = path.basename(dbPath);
    const baseName = path.parse(fileName).name;
    const outputDir = path.join(HLS_DIR, baseName);

    // ✅ Skip only if HLS exists & valid
    if (row.video_hls_path && validateHls(outputDir)) {
      log(`✅ Valid HLS found → skipping: ${dbPath}`);
      return;
    }

    // 🔍 Check if input file exists
    let inputPath = path.join(UPLOADS_DIR, fileName);
    if (!fs.existsSync(inputPath)) {
      inputPath = findFileByNameInsensitive(fileName, UPLOADS_DIR);
      if (!inputPath) {
        log(`❌ File not found for DB entry: ${dbPath} → skipping`);
        return;
      }
    }

    const resolutions = ["360", "720", "1080"];
    let allValid = true;

    for (const res of resolutions) {
      if (hlsExists(outputDir, res) && validateHls(outputDir, res)) {
        log(`ℹ️ Found valid ${res}p HLS → skipping: ${fileName}`);
      } else {
        log(`⚠️ Missing/incomplete ${res}p HLS → converting: ${fileName}`);
        await convertToHls(inputPath, outputDir, baseName, res);
      }

      if (!validateHls(outputDir, res)) allValid = false;
    }

    if (allValid) {
      const hlsRelativePath = path.join("hls", `${baseName}.m3u8`);
      await db.query(
        `UPDATE ${table} SET video_hls_path = ? WHERE id = ?`,
        [hlsRelativePath, row.id]
      );
      log(`✅ Completed HLS & updated DB: ${fileName}`);
    } else {
      log(`⚠️ HLS incomplete for some resolutions: ${fileName}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  } catch (err) {
    log(`❌ Conversion failed for ${table}.${row.id}: ${err.message}`);
  }
}

async function batchConvert() {
  try {
    const [tables] = await db.query("SHOW TABLES");
    for (const t of tables) {
      const table = Object.values(t)[0];
      const [columns] = await db.query(`SHOW COLUMNS FROM ${table}`);
      const colNames = columns.map(c => c.Field);

      if (!colNames.includes("video_hls_path")) continue;

      const [rows] = await db.query(`SELECT * FROM ${table}`);
      log(`📂 Table: ${table}, Rows: ${rows.length}`);

      for (const row of rows) {
        for (const col of colNames) {
          if (row[col] && VIDEO_EXT.test(row[col])) {
            await processRow(table, row, col);
          }
        }
      }
    }
    log("🏁 Batch conversion completed!");
  } catch (err) {
    log(`❌ Batch conversion failed: ${err.message}`);
  } finally {
    db.end();
  }
}

// 🧱 Global async safety
process.on("unhandledRejection", err => log(`🚨 Unhandled rejection: ${err.message}`));

batchConvert();
