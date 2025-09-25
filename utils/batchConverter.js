import db from "../db.js";
import fs from "fs";
import path from "path";
import { findFileByNameInsensitive } from "./fileFinder.js"; 
import convertToHls from "./hlsconvert.js";

const HLS_DIR = path.join(process.cwd(), "public/hls");
const UPLOADS_DIR = path.join(process.cwd(), "public/uploads");
const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm)$/i;

function hlsExists(outputDir) {
  return fs.existsSync(path.join(outputDir, "index.m3u8"));
}

// Search file by filename if DB path not found
function findFileByName(fileName) {
  const results = [];
  const walk = dir => {
    for (const f of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, f);
      if (fs.statSync(fullPath).isDirectory()) walk(fullPath);
      else if (path.basename(f) === fileName) results.push(fullPath);
    }
  };
  walk(UPLOADS_DIR);
  if (results.length > 1) console.warn(`⚠️ Multiple matches found for ${fileName}, using first`);
  return results[0] || null;
}

async function processRow(table, row, column) {
  try {
    let dbPath = row[column];
    if (!dbPath || !VIDEO_EXT.test(dbPath)) return;

    if (row.video_hls_path) {
      console.log(`⚠️ Already has HLS → skipping: ${dbPath}`);
      return;
    }

    const fileName = path.basename(dbPath);
    const baseName = path.parse(fileName).name;
    const outputDir = path.join(HLS_DIR, baseName);

    // Check if file exists at DB path
    let inputPath = path.join(UPLOADS_DIR, path.basename(dbPath.trim()));

    if (!fs.existsSync(inputPath)) {
      inputPath = findFileByNameInsensitive(fileName, UPLOADS_DIR);
      if (!inputPath) {
        console.warn(`❌ File not found for DB entry: ${dbPath} → skipping`);
        return;
      }
    }

    if (hlsExists(outputDir)) {
      const existingPath = path.join("hls", baseName, "index.m3u8");
      await db.query(`UPDATE ${table} SET video_hls_path = ? WHERE id = ?`, [existingPath, row.id]);
      console.log(`ℹ️ Found existing HLS → updated DB: ${fileName}`);
      return;
    }

    console.log(`🎬 Starting conversion: ${fileName}`);

    const hlsPath = await convertToHls(inputPath, outputDir, baseName);

    const hlsRelativePath = path.join("hls", `${baseName}.m3u8`);
    await db.query(`UPDATE ${table} SET video_hls_path = ? WHERE id = ?`, [hlsRelativePath, row.id]);

    console.log(`✅ Completed conversion & DB update: ${fileName}`);

    await new Promise(r => setTimeout(r, 2000)); 
  } catch (err) {
    console.error(`❌ Conversion failed for ${table}.${row.id}:`, err.message);
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
      console.log(`📂 Table: ${table}, Rows: ${rows.length}`);

      for (const row of rows) {
        for (const col of colNames) {
          if (row[col] && VIDEO_EXT.test(row[col])) {
            await processRow(table, row, col);
          }
        }
      }
    }
    console.log("🏁 Batch conversion completed!");
  } catch (err) {
    console.error("❌ Batch conversion failed:", err);
  } finally {
    db.end();
  }
}

batchConvert();
