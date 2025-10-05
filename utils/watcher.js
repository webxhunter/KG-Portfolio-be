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

let processedMap = new Map();
const processingQueue = [];
let isProcessing = false;
let isScanning = false;
const currentlyProcessingSet = new Set(); // starts empty on restart

// --------------------
// Load / Save processed map
// --------------------
function loadProcessedMap() {
  try {
    if (!fs.existsSync(PROCESSED_JSON)) return new Map();
    const obj = JSON.parse(fs.readFileSync(PROCESSED_JSON, "utf-8"));
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveProcessedMap() {
  try {
    fs.writeFileSync(PROCESSED_JSON, JSON.stringify(Object.fromEntries(processedMap), null, 2));
  } catch (err) {
    console.error("⚠️ Failed to save processedVideos.json:", err.message || err);
  }
}

processedMap = loadProcessedMap();

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
// Wait until file is stable
// --------------------
async function waitUntilStableAdaptive(filePath, maxWaitMs = 60 * 60 * 1000) {
  if (!fs.existsSync(filePath)) return false;
  const size = fs.statSync(filePath).size;
  const stableChecks = size < 10_000_000 ? 2 : size < 100_000_000 ? 3 : 5;
  return await waitUntilStable(filePath, maxWaitMs, stableChecks);
}

// --------------------
// Find DB record
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

// --------------------
// Update DB record
// --------------------
async function updateDbRecordHls(table, id, hlsPath) {
  try {
    await pool.query(`UPDATE \`${table}\` SET video_hls_path = ? WHERE id = ?`, [hlsPath, id]);
    console.log(`💾 DB updated: ${table} id=${id} → ${hlsPath}`);
  } catch (err) {
    console.error(`⚠️ Failed to update DB (${table} id=${id}):`, err.message || err);
  }
}

// --------------------
// Wait for DB record with retries
// --------------------
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
// -------------------
async function processSingleFile(filePath, options = {}) {
  const filename = path.basename(filePath);
  const filenameLower = filename.toLowerCase();
  const baseName = path.parse(filePath).name;

  if (currentlyProcessingSet.has(filenameLower)) return;
  currentlyProcessingSet.add(filenameLower);

  try {
    const stable = await waitUntilStableAdaptive(filePath);
    if (!stable) return;

    const valid = await isValidVideo(filePath);
    if (!valid) return;

    const stats = fs.statSync(filePath);
    const prev = processedMap.get(filenameLower);

    if (prev && prev.size === stats.size && prev.timestamp === stats.mtimeMs) {
      console.log(`ℹ️ Skipping ${filename} — already processed and DB up-to-date`);
      return;
    }

    if (options.isUpdate && prev && prev.size === stats.size) {
      console.log(`ℹ️ Update detected for ${filename} but already processed, skipping old HLS removal`);
    } else if (options.isUpdate) {
      console.log(`ℹ️ Update detected for ${filename}, removing old HLS folder`);
      removeOldHls(baseName);
      processedMap.delete(filenameLower);
      saveProcessedMap();
    }

    fs.mkdirSync(path.join(HLS_DIR, baseName), { recursive: true });
    console.log(`🎬 Starting HLS conversion for: ${filename} ...`);
    await convertToHls(filePath, path.join(HLS_DIR, baseName), baseName);

    const hlsRelative = `/hls/${baseName}.m3u8`;

    if (options.dbTarget) {
      console.log(`📝 Updating DB for ${filename} ...`);
      await updateDbRecordHls(options.dbTarget.table, options.dbTarget.id, hlsRelative);
    }

    processedMap.set(filenameLower, { size: stats.size, timestamp: stats.mtimeMs });
    saveProcessedMap();

    console.log(`🎬 Conversion completed successfully: ${filename}`);
  } catch (err) {
    console.error("❌ processSingleFile error:", err.message || err);
  } finally {
    currentlyProcessingSet.delete(filenameLower);
  }
}

// --------------------
// Queue processor
// --------------------
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (processingQueue.length > 0) {
    const task = processingQueue.shift();

    let dbTarget = task.options.dbTarget || null;
    if (!dbTarget && task.dbRetries) {
      const rec = await waitForDbRecord(task.filePath, task.dbRetries);
      if (rec) dbTarget = { table: rec.table, id: rec.id };
    }

    await processSingleFile(task.filePath, { ...task.options, dbTarget });
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

  watcher.on("add", async (filePath) => {
    const filenameLower = path.basename(filePath).toLowerCase();
    if (!VIDEO_EXT.test(filePath)) return;
    if (currentlyProcessingSet.has(filenameLower) || processingQueue.some(t => t.filePath && path.basename(t.filePath).toLowerCase() === filenameLower)) return;

    processingQueue.push({ filePath, options: {}, dbRetries: 5 });
    console.log(`📦 Queued for conversion: ${path.basename(filePath)}`);
    processQueue();
  });

  watcher.on("unlink", (filePath) => {
    if (!VIDEO_EXT.test(filePath)) return;
    removeOldHls(path.parse(filePath).name);
    const filenameLower = path.basename(filePath).toLowerCase();
    processedMap.delete(filenameLower);
    saveProcessedMap();
    console.log(`🗑️ File deleted: ${filePath}`);
  });

  console.log("👀 FS watcher started");
}

// --------------------
// DB Watcher
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

          const fileName = path.basename(rec.video_path);
          const filenameLower = fileName.toLowerCase();

          if (currentlyProcessingSet.has(filenameLower) || processingQueue.some(t => t.filePath && path.basename(t.filePath).toLowerCase() === filenameLower)) {
            console.log(`⏳ Skipping DB queue for ${fileName} — already processing or queued`);
            continue;
          }

          const filePath = findFileByNameInsensitive(fileName, UPLOADS_DIR);
          if (!filePath) continue;

          console.log(`🔄 DB-triggered UPDATE (filename mismatch): ${fileName}`);
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
// Start everything
// --------------------
console.log("👀 Starting watcher (FS + DB)...");
console.log("📂 Uploads:", UPLOADS_DIR);
console.log("📂 HLS:", HLS_DIR);

startFsWatcher();
setInterval(scanDbForUpdates, 2000);
