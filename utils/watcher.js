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

// Queue for updated videos
const pendingUpdates = new Set();

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

// ✅ Save processed videos
function saveProcessedVideos(processed) {
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
    console.log(`⏳ Conversion in progress, queueing: ${filePath}`);
    pendingUpdates.add(filePath); // queue this file for later
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
    processPendingUpdates();
    return;
  }

  console.log(`✅ File is stable: ${filePath}`);

  const valid = await isValidVideo(filePath);
  if (!valid) {
    console.warn(`⚠️ Invalid or corrupted video skipped: ${filePath}`);
    isProcessing = false;
    processPendingUpdates();
    return;
  }

  if (isUpdate) {
    console.log(`♻️ Video updated — regenerating HLS: ${filePath}`);
    removeOldHls(baseName);

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

    const processedVideos = loadProcessedVideos();
    processedVideos.add(filePath);
    saveProcessedVideos(processedVideos);
  } else {
    console.warn(`⚠️ Conversion failed for ${baseName}`);
  }

  processedFiles.add(filePath);
  isProcessing = false;

  // Process any queued updates
  processPendingUpdates();
}

// ✅ Process queued updates
async function processPendingUpdates() {
  if (pendingUpdates.size === 0 || isProcessing) return;

  const filePath = pendingUpdates.values().next().value;
  pendingUpdates.delete(filePath);
  await processVideo(filePath, true); // force HLS regen for update
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
      if (videoCols.length === 0) continue;

      for (const col of videoCols) {
        const [records] = await pool.query(
          `SELECT * FROM ${table} WHERE ${col.Field} LIKE ? LIMIT 1`,
          [`%${baseName}%`]
        );
        if (records.length === 0) continue;

        const query = `UPDATE ${table} SET video_hls_path = ? WHERE ${col.Field} LIKE ?`;
        await pool.query(query, [`/hls/${baseName}.m3u8`, `%${baseName}%`]);

        console.log(`✅ DB updated for table "${table}" and video: ${baseName}`);
        return;
      }
    }

    console.warn(`⚠️ No DB entry found for video: ${baseName}`);
  } catch (err) {
    console.error(`⚠️ Failed to update DB for ${baseName}:`, err.message);
  }
}

// ✅ Scan DB for new or updated videos
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
        // Only fetch videos with non-null path
        const [records] = await pool.query(
          `SELECT * FROM ${table} WHERE ${col.Field} IS NOT NULL`
        );

        for (const rec of records) {
          const val = rec[col.Field];
          if (typeof val !== "string" || !VIDEO_EXT.test(val)) continue;

          const filename = path.basename(val);
          const filePath = findFileByNameInsensitive(filename, UPLOADS_DIR);
          if (!filePath) continue;

          const processedVideos = loadProcessedVideos(); // your JSON of processed files

          if (!processedVideos.has(filePath) && rec.video_hls_path === null) {
            // New video, not yet processed
            console.log(`🔄 DB-triggered new video detected: ${filename}`);
            await processVideo(filePath);
          } else if (processedVideos.has(filePath) && rec.video_hls_path !== `/hls/${path.parse(filePath).name}.m3u8`) {
            // DB entry changed, force update
            console.log(`♻️ DB update detected — regenerating HLS for: ${filename}`);
            console.log(`📝 Original file will be replaced: ${filePath}`);
            await processVideo(filePath, true); // force HLS regeneration
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
    await processVideo(filePath, true); // always force update for changed files
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
