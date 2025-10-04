import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import pool from "../db.js";
import {
  VIDEO_EXT,
  isValidVideo,
  waitUntilStable,
  convertAndValidate
} from "./helpers.js";
import { findFileByNameInsensitive } from "./fileFinder.js";

const UPLOADS_DIR = path.resolve("public/uploads");
const HLS_DIR = path.resolve("public/hls");
const PROCESSED_JSON = path.resolve("/var/www/KG-Portfolio-be/processedVideos.json");

const processedFiles = new Set();
let isScanning = false;
let isProcessing = false; 

// ✅ Load processed videos from JSON
function loadProcessedVideos() {
  try {
    if (!fs.existsSync(PROCESSED_JSON)) return new Set();
    const data = JSON.parse(fs.readFileSync(PROCESSED_JSON, "utf-8"));
    return new Set(data);
  } catch {
    return new Set();
  }
}

// ✅ Save processed video to JSON
function saveProcessedVideo(filePath) {
  const processed = loadProcessedVideos();
  processed.add(filePath);
  fs.writeFileSync(PROCESSED_JSON, JSON.stringify(Array.from(processed), null, 2));
}

// ✅ Remove old HLS outputs
function removeOldHls(baseName) {
  const dir = path.join(HLS_DIR, baseName);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`🗑️ Removed old HLS for: ${baseName}`);
  }
}

// ✅ Process video one-by-one
async function processVideo(filePath, isUpdate = false) {
  if (isProcessing) {
    console.log(`⏳ Waiting... Another conversion is in progress`);
    return;
  }

  isProcessing = true;
  const baseName = path.parse(filePath).name;
  const outputDir = path.join(HLS_DIR, baseName);

  console.log(`📁 Checking file stability for: ${filePath}`);
  const stable = await waitUntilStable(filePath, 60 * 60 * 1000, 3);

  if (!stable) {
    console.warn(`⚠️ Skipping — file not stable: ${filePath}`);
    isProcessing = false;
    return;
  }

  console.log(`✅ File is stable: ${filePath}`);

  const valid = await isValidVideo(filePath);
  if (!valid) {
    console.warn(`⚠️ Invalid or corrupted video skipped: ${filePath}`);
    isProcessing = false;
    return;
  }

  // If this is an update, remove old HLS first
  if (isUpdate) {
    console.log(`♻️ Video updated — regenerating HLS: ${filePath}`);
    removeOldHls(baseName);

    // Remove from processedVideos.json if exists
    const processedVideos = loadProcessedVideos();
    if (processedVideos.has(filePath)) {
      processedVideos.delete(filePath);
      saveProcessedVideos(processedVideos);
      console.log(`🗂️ Updated processedVideos.json entry for: ${baseName}`);
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`🎬 Starting HLS conversion for: ${baseName}`);
  const success = await convertAndValidate(filePath, outputDir, baseName);

  if (success) {
    console.log(`✅ Conversion completed for ${baseName}`);
    await updateDbWithNewHlsPath(filePath, `${baseName}.m3u8`);

    // Add/update processedVideos.json
    const processedVideos = loadProcessedVideos();
    processedVideos.add(filePath);
    saveProcessedVideos(processedVideos);
  } else {
    console.warn(`⚠️ Conversion failed for ${baseName}`);
  }

  processedFiles.add(filePath);
  isProcessing = false;
}
// ✅ Update DB for a specific video file
async function updateDbWithNewHlsPath(filePath, newHls) {
  const baseName = path.parse(filePath).name;

  try {
    const [tables] = await pool.query("SHOW TABLES");

    for (const row of tables) {
      const table = Object.values(row)[0];
      const [cols] = await pool.query(`SHOW COLUMNS FROM ${table}`);
      const videoCols = cols.filter(c => /video/i.test(c.Field));

      for (const col of videoCols) {
        const [records] = await pool.query(
          `SELECT * FROM ${table} WHERE ${col.Field} LIKE ? AND video_hls_path IS NULL LIMIT 1`,
          [`%${baseName}%`]
        );
        if (records.length === 0) continue;

        const query = `
          UPDATE ${table}
          SET video_hls_path = ?
          WHERE ${col.Field} LIKE ?`;
        await pool.query(query, [`/hls/${baseName}.m3u8`, `%${baseName}%`]);

        console.log(`✅ DB updated for table "${table}" and video: ${baseName}`);
        return; 
      }
    }

    console.warn(`⚠️ No DB entry found for video: ${baseName} or already processed`);
  } catch (err) {
    console.error(`⚠️ Failed to update DB for ${baseName}:`, err.message);
  }
}

// ✅ Scan DB for new videos with null HLS path
async function scanDbForChangedFiles() {
  if (isScanning || isProcessing) return; 
  isScanning = true;

  try {
    const [tables] = await pool.query("SHOW TABLES");
    for (const row of tables) {
      const table = Object.values(row)[0];

      const [cols] = await pool.query(`SHOW COLUMNS FROM ${table}`);
      const videoCols = cols.filter(c => /video/i.test(c.Field));
      if (videoCols.length === 0) continue;

      // ✅ Skip tables without 'video_hls_path'
      const hasHlsColumn = cols.some(c => c.Field === 'video_hls_path');
      if (!hasHlsColumn) continue;

      for (const col of videoCols) {
        // Only fetch videos with non-null path and null HLS
        const [records] = await pool.query(
          `SELECT * FROM ${table} WHERE ${col.Field} IS NOT NULL AND video_hls_path IS NULL`
        );

        for (const rec of records) {
          const val = rec[col.Field];
          if (typeof val !== "string" || !VIDEO_EXT.test(val)) continue;

          const filename = path.basename(val);
          const filePath = findFileByNameInsensitive(filename, UPLOADS_DIR);
          if (!filePath) continue;

          const processedVideos = loadProcessedVideos(); // load your JSON of processed files
          if (!processedVideos.has(filePath)) {
            console.log(`🔄 DB-triggered video detected: ${filename}`);
            await processVideo(filePath);
          } else {
            console.log(`⏭️ Skipping already processed video: ${filename}`);
          }
        }
      }
    }
  } catch (err) {
    console.error("⚠️ DB Watcher Error:", err.message);
  } finally {
    isScanning = false;
  }
}

// ✅ Unified Watcher
const startWatcher = () => {
  const watcher = chokidar.watch(UPLOADS_DIR, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    depth: 2,
    ignoreInitial: true
  });

  watcher.on("add", async (filePath) => {
    if (!VIDEO_EXT.test(filePath)) return;
    console.log(`📥 New video detected: ${filePath}`);
    await processVideo(filePath);
  });

  watcher.on("change", async (filePath) => {
    if (!VIDEO_EXT.test(filePath)) return;
    console.log(`♻️ Video modified or replaced: ${filePath}`);
    await processVideo(filePath);
  });

  watcher.on("unlink", (filePath) => {
    if (!VIDEO_EXT.test(filePath)) return;
    const baseName = path.parse(filePath).name;
    removeOldHls(baseName);
  });

  watcher.on("error", (err) => console.error("⚠️ Watcher error:", err));

  console.log("👀 Watcher started — Monitoring uploads & DB for new/updated videos...");
  setInterval(scanDbForChangedFiles, 1000);
};

startWatcher();
