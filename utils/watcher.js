import dotenv from "dotenv";
dotenv.config();

import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import pool from "../db.js";
import { VIDEO_EXT, isValidVideo, waitUntilStable } from "./helpers.js";
import { findFileByNameInsensitive } from "./fileFinder.js";
import convertToHls from "./hlsconvert.js";

const PROJECT_ROOT = path.resolve(process.cwd());
const UPLOADS_DIR = path.join(PROJECT_ROOT, "public/uploads");
const HLS_DIR = path.join(PROJECT_ROOT, "public/hls");
const PROCESSED_JSON = path.join(PROJECT_ROOT, "processedVideos.json");

// --------------------
// Sets & Queues
// --------------------
let processedSet = new Set();
const processingSet = new Set(); // ✅ temporary set while converting
const processingQueue = [];
let isProcessing = false;
let isScanning = false;

// --------------------
// Load / Save processed set
// --------------------
function loadProcessedSet() {
  try {
    if (!fs.existsSync(PROCESSED_JSON)) return new Set();
    return new Set(JSON.parse(fs.readFileSync(PROCESSED_JSON, "utf-8")));
  } catch {
    return new Set();
  }
}

function saveProcessedSet() {
  try {
    fs.writeFileSync(PROCESSED_JSON, JSON.stringify([...processedSet], null, 2));
  } catch (err) {
    console.error("⚠️ Failed to save processedVideos.json:", err.message || err);
  }
}

processedSet = loadProcessedSet();

// --------------------
// Remove old HLS folder
// --------------------
function removeOldHls(baseName) {
  const dir = path.join(HLS_DIR, baseName);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`🗑️ Removed old HLS folder: ${dir}`);
  }
}

// --------------------
// Adaptive stability check
// --------------------
async function waitUntilStableAdaptive(filePath, maxWaitMs = 60 * 60 * 1000) {
  if (!fs.existsSync(filePath)) return false;
  const size = fs.statSync(filePath).size;
  const stableChecks = size < 10_000_000 ? 2 : size < 100_000_000 ? 3 : 5;
  return await waitUntilStable(filePath, maxWaitMs, stableChecks);
}

// --------------------
// DB Helpers
// --------------------
async function findDbRecordForFilename(filename) {
  try {
    const [tables] = await pool.query("SHOW TABLES");
    for (const t of tables) {
      const table = Object.values(t)[0];
      const [cols] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
      if (!cols.some(c => c.Field === "video_hls_path")) continue;

      const videoCols = cols.filter(c => /video/i.test(c.Field));
      for (const vc of videoCols) {
        const [rows] = await pool.query(
          `SELECT id, \`${vc.Field}\` AS video_path, video_hls_path FROM \`${table}\` WHERE \`${vc.Field}\` LIKE ? LIMIT 1`,
          [`%${filename}%`]
        );
        if (rows.length) return {
          table,
          column: vc.Field,
          id: rows[0].id,
          video_path: rows[0].video_path,
          video_hls_path: rows[0].video_hls_path
        };
      }
    }
    return null;
  } catch (err) {
    console.error("⚠️ findDbRecordForFilename error:", err.message || err);
    return null;
  }
}

async function updateDbRecordHls(table, id, hlsPath) {
  try {
    await pool.query(`UPDATE \`${table}\` SET video_hls_path = ? WHERE id = ?`, [hlsPath, id]);
    console.log(`💾 DB updated: ${table} id=${id} → ${hlsPath}`);
  } catch (err) {
    console.error(`⚠️ Failed to update DB (${table} id=${id}):`, err.message || err);
  }
}

async function waitForDbRecord(filePath, retries = 5) {
  const filename = path.basename(filePath);
  let rec = null;
  for (let i = 0; i < retries; i++) {
    rec = await findDbRecordForFilename(filename);
    if (rec) return rec;
    await new Promise(r => setTimeout(r, 1000));
  }
  return null;
}

// --------------------
// Process single file
// --------------------
async function processSingleFile(filePath, options = {}) {
  const filename = path.basename(filePath);
  const baseName = path.parse(filePath).name;
  const outputDir = path.join(HLS_DIR, baseName);

  if (processingSet.has(filename)) {
    console.log(`⏳ Skipping ${filename} — already in processingSet`);
    return;
  }

  // ✅ Add file to temporary processing set
  processingSet.add(filename);

  try {
    const stable = await waitUntilStableAdaptive(filePath);
    if (!stable) return;

    const valid = await isValidVideo(filePath);
    if (!valid) return;

    if (options.isUpdate) {
      console.log(`ℹ️ Update detected for ${filename}, removing old HLS folder`);
      removeOldHls(baseName);
      processedSet.delete(filename);
      saveProcessedSet();
    }

    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`🎬 Starting HLS conversion for: ${filename} ...`);
    await convertToHls(filePath, outputDir, baseName);

    const hlsRelative = `/hls/${baseName}.m3u8`;

    if (options.dbTarget) {
      await updateDbRecordHls(options.dbTarget.table, options.dbTarget.id, hlsRelative);
    }

    processedSet.add(filename);
    saveProcessedSet();
    console.log(`✅ Conversion completed: ${filename}`);
  } catch (err) {
    console.error("❌ processSingleFile error:", err.message || err);
  } finally {
    // ✅ Always remove file from temporary set after completion
    processingSet.delete(filename);
  }
}

// --------------------
// Queue processing
// --------------------
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (processingQueue.length > 0) {
    const task = processingQueue.shift();
    await processSingleFile(task.filePath, task.options);
  }

  isProcessing = false;
}

// --------------------
// FS Watcher
// --------------------
function startFsWatcher() {
  if (global.fsWatcherStarted) return;
  global.fsWatcherStarted = true;

  const watcher = chokidar.watch(UPLOADS_DIR, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    depth: 10,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 5000, pollInterval: 1000 }
  });

  watcher.on("add", (filePath) => {
    if (!VIDEO_EXT.test(filePath)) return;
    const filename = path.basename(filePath);
    if (processingSet.has(filename)) {
      console.log(`🚫 FS: ${filename} already processing, skipping`);
      return;
    }

    console.log(`📸 New upload detected: ${filename}`);
    processingQueue.push({ filePath, options: {} });
    processQueue();
  });

  watcher.on("unlink", (filePath) => {
    if (!VIDEO_EXT.test(filePath)) return;
    removeOldHls(path.parse(filePath).name);
    const filename = path.basename(filePath);
    processedSet.delete(filename);
    saveProcessedSet();
    console.log(`🗑️ File deleted: ${filename}`);
  });

  console.log("👀 FS watcher started");
}

// --------------------
// DB Watcher (updates)
// --------------------
async function scanDbForUpdates() {
  if (isScanning) return;
  isScanning = true;

  try {
    const [tables] = await pool.query("SHOW TABLES");
    for (const t of tables) {
      const table = Object.values(t)[0];
      const [cols] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
      if (!cols.some(c => c.Field === "video_hls_path")) continue;

      const videoCols = cols.filter(c => /video/i.test(c.Field));
      for (const vc of videoCols) {
        const [rows] = await pool.query(`
          SELECT id, \`${vc.Field}\` AS video_path, video_hls_path
          FROM \`${table}\`
          WHERE video_hls_path IS NOT NULL
            AND video_hls_path <> CONCAT('/hls/', SUBSTRING_INDEX(SUBSTRING_INDEX(\`${vc.Field}\`, '/', -1), '.', 1), '.m3u8')
          LIMIT 50
        `);

        for (const rec of rows) {
          if (!rec.video_path || !VIDEO_EXT.test(rec.video_path)) continue;

          const filename = path.basename(rec.video_path);
          if (processingSet.has(filename)) {
            console.log(`🚫 DB: ${filename} already processing, skipping`);
            continue;
          }

          const filePath = findFileByNameInsensitive(filename, UPLOADS_DIR);
          if (!filePath) continue;

          console.log(`🔄 DB-triggered update for: ${filename}`);
          processingQueue.push({
            filePath,
            options: { dbTarget: { table, id: rec.id }, isUpdate: true }
          });
          processQueue();
        }
      }
    }
  } catch (err) {
    console.error("⚠️ DB scan error:", err.message || err);
  } finally {
    isScanning = false;
  }
}

// --------------------
// Start watchers
// --------------------
console.log("👀 Starting watcher (FS + DB)...");
console.log("📂 Uploads:", UPLOADS_DIR);
console.log("📂 HLS:", HLS_DIR);

startFsWatcher();
setInterval(scanDbForUpdates, 2000);
