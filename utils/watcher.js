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
import { findFileByNameInsensitive } from "./filefinder.js";

const UPLOADS_DIR = path.resolve("public/uploads");
const HLS_DIR = path.resolve("public/hls");

const processedFiles = new Set();
let isScanning = false;
let isProcessing = false; 

// ✅ Remove old HLS outputs
function removeOldHls(baseName) {
  const dir = path.join(HLS_DIR, baseName);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`🗑️ Removed old HLS for: ${baseName}`);
  }
}

// ✅ Process video one-by-one
async function processVideo(filePath) {
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

  // Delete old chunks before reprocessing
  removeOldHls(baseName);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`🎬 Starting HLS conversion for: ${baseName}`);
  const success = await convertAndValidate(filePath, outputDir, baseName);

  if (success) {
    console.log(`✅ Conversion completed for ${baseName}`);
    await updateDbWithNewHlsPath(baseName, `${baseName}.m3u8`);
  } else {
    console.warn(`⚠️ Conversion failed for ${baseName}`);
  }

  processedFiles.add(filePath);
  isProcessing = false;
}

// ✅ Periodic DB Scanner
async function scanDbForChangedFiles() {
  if (isScanning || isProcessing) return; // avoid overload
  isScanning = true;

  try {
    const [tables] = await pool.query("SHOW TABLES");
    for (const row of tables) {
      const table = Object.values(row)[0];

      const [cols] = await pool.query(`SHOW COLUMNS FROM ${table}`);
      const videoCols = cols.filter(c => /video/i.test(c.Field));

      if (videoCols.length === 0) continue;

      const [records] = await pool.query(`SELECT * FROM ${table}`);
      for (const rec of records) {
        for (const col of videoCols) {
          const val = rec[col.Field];
          if (typeof val !== "string" || !VIDEO_EXT.test(val)) continue;

          const filename = path.basename(val);
          const filePath = findFileByNameInsensitive(filename, UPLOADS_DIR);
          if (!filePath) continue;

          if (!processedFiles.has(filePath)) {
            console.log(`🔄 DB-triggered video detected: ${filename}`);
            await processVideo(filePath);
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

// ✅ Update DB with new HLS path
async function updateDbWithNewHlsPath(baseName, newHls) {
  try {
    const [tables] = await pool.query("SHOW TABLES");

    for (const row of tables) {
      const table = Object.values(row)[0];
      const [cols] = await pool.query(`SHOW COLUMNS FROM ${table}`);
      const videoCols = cols.filter(c => /video/i.test(c.Field));

      for (const col of videoCols) {
        const query = `
          UPDATE ${table}
          SET video_hls_path = ?
          WHERE ${col.Field} LIKE ?`;
        await pool.query(query, [`/hls/${newHls}`, `%${baseName}%`]);
      }
    }

    console.log(`✅ DB updated with new HLS path for: ${baseName}`);
  } catch (err) {
    console.error(`⚠️ Failed to update DB for ${baseName}:`, err.message);
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

  console.log("👀 Watcher started — Monitoring uploads & DB for changes...");
  setInterval(scanDbForChangedFiles, 1000);
};

startWatcher();