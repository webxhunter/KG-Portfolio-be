import "./logger.js";

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

let processedSet = new Set();
const processingQueue = [];
let isProcessing = false;
let isScanning = false;
const activeConversionSet = new Set();

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
function removeOldHls(baseName) {
  const dir = path.join(HLS_DIR, baseName);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`🗑️ Removed old HLS folder: ${dir}`);
  }
}

// 🧹 Auto-cleanup for failed/incomplete conversions
function cleanupIncomplete(outputDir) {
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    console.log(`🧹 Cleaned up incomplete folder: ${outputDir}`);
  }
}

// --------------------
async function waitUntilStableAdaptive(filePath, maxWaitMs = 60 * 60 * 1000) {
  if (!fs.existsSync(filePath)) return false;
  const size = fs.statSync(filePath).size;
  const stableChecks = size < 10_000_000 ? 2 : size < 100_000_000 ? 3 : 5;
  return await waitUntilStable(filePath, maxWaitMs, stableChecks);
}

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

        if (rows.length)
          return {
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
async function updateDbRecordHls(table, id, hlsPath) {
  try {
    await pool.query(`UPDATE \`${table}\` SET video_hls_path = ? WHERE id = ?`, [hlsPath, id]);
    console.log("🔥 SQL: UPDATE successful for", table, id);
    console.log(`💾 DB updated: ${table} id=${id} → ${hlsPath}`);
  } catch (err) {
    console.error(`⚠️ Failed to update DB (${table} id=${id}):`, err.message || err);
  }
}

// --------------------
async function waitForDbRecord(filePath, retries = 5) {
  const filename = path.basename(filePath);
  let rec = null;

  for (let i = 0; i < retries; i++) {
    rec = await findDbRecordForFilename(filename);
    if (rec) {
      console.log("✅ DB RECORD FOUND! Table:", rec.table, "ID:", rec.id);
      return rec;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  return null;
}

// --------------------
async function processSingleFile(filePath, options = {}) {
  const filename = path.basename(filePath);
  const baseName = path.parse(filename).name;
  const outputDir = path.join(HLS_DIR, baseName);

  try {
    const stable = await waitUntilStableAdaptive(filePath);
    if (!stable) return;

    const valid = await isValidVideo(filePath);
    if (!valid) return;

    if (options.isUpdate && !processedSet.has(filename)) {
      console.log(`ℹ️ Update detected for ${filename}, removing old HLS folder`);
      removeOldHls(baseName);
      processedSet.delete(filename);
      saveProcessedSet();
    }

    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`🎬 Starting HLS conversion for: ${filename} ...`);
    await convertToHls(filePath, outputDir, baseName);

    const hlsRelative = `hls/${baseName}.m3u8`;

    if (options.dbTarget) {
      console.log(`🔄 ATTEMPTING DB UPDATE for ID: ${options.dbTarget.id}`);
      console.log(`📝 Updating DB for ${filename} ...`);
      await updateDbRecordHls(options.dbTarget.table, options.dbTarget.id, hlsRelative);

      // ⏳ Wait and verify the update against the DB
      await new Promise(res => setTimeout(res, 1000));
      const [rows] = await pool.query(
        `SELECT video_hls_path FROM \`${options.dbTarget.table}\` WHERE id = ? LIMIT 1`,
        [options.dbTarget.id]
      );

      if (rows.length && (rows[0].video_hls_path === hlsRelative || rows[0].video_hls_path === `/${hlsRelative}`)) {
        console.log(`✅ Verified DB updated correctly for ${filename}`);
      } else {
        console.log(`⚠️ DB still not matching for ${filename}, will check again next scan.`);
      }
    }

    processedSet.add(filename);
    saveProcessedSet();
    console.log(`🏁 Done: ${filename} → HLS created & DB updated`);
  } catch (err) {
    console.error(`❌ processSingleFile error for ${filename}:`, err.message || err);
    cleanupIncomplete(outputDir); 
  }
}

// --------------------
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (processingQueue.length > 0) {
    const task = processingQueue.shift();
    const filename = path.basename(task.filePath);
    let dbTarget = task.options.dbTarget || null;

    if (!dbTarget && task.dbRetries) {
      console.log("⏳ Starting DB record wait for:", filename, "Retries:", task.dbRetries);
      const rec = await waitForDbRecord(task.filePath, task.dbRetries);
      if (rec) dbTarget = { table: rec.table, id: rec.id };
    }

    try {
      await processSingleFile(task.filePath, { ...task.options, dbTarget });
    } catch (error) {
      console.error(`🚨 Error processing ${filename}:`, error.message);
    } finally {
      activeConversionSet.delete(filename);
    }
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
    if (!VIDEO_EXT.test(filePath)) return;

    const filename = path.basename(filePath);
    if (activeConversionSet.has(filename)) return;
    activeConversionSet.add(filename);

    console.log(`📸 FS detected new upload: ${filename}`);
    console.log("➡️ FILENAME SENT TO WAIT FOR DB:", filename);
    processingQueue.push({ filePath, options: {}, dbRetries: 20 });
    console.log(`📦 Queued for conversion: ${filename}`);
    processQueue();
  });

  watcher.on("unlink", (filePath) => {
    if (!VIDEO_EXT.test(filePath)) return;

    const filename = path.basename(filePath);
    removeOldHls(path.parse(filename).name);
    processedSet.delete(filename);
    activeConversionSet.delete(filename);
    saveProcessedSet();
  });

  console.log("👀 FS watcher started");
}

// --------------------
// DB Watcher
// --------------------
const MAX_CONCURRENT_QUEUE_SIZE = 5;

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
            AND SUBSTRING_INDEX(SUBSTRING_INDEX(video_hls_path, '/', -1), '.', 1)
            <> SUBSTRING_INDEX(SUBSTRING_INDEX(\`${vc.Field}\`, '/', -1), '.', 1)
          LIMIT 50
        `);

        for (const rec of rows) {
          if (!rec.video_path || !VIDEO_EXT.test(rec.video_path)) continue;

          const filename = path.basename(rec.video_path);

          if (activeConversionSet.size >= MAX_CONCURRENT_QUEUE_SIZE) {
            console.log(`⚠️ DB scan deferred: Active queue size (${activeConversionSet.size}) reached limit (${MAX_CONCURRENT_QUEUE_SIZE}).`);
            return;
          }

          if (activeConversionSet.has(filename)) continue;

          const filePath = findFileByNameInsensitive(filename, UPLOADS_DIR);
          if (!filePath) continue;

          activeConversionSet.add(filename);
          console.log(`🔄 DB-triggered UPDATE: ${filename}`);

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
console.log("👀 Starting watcher (FS + DB)...");
startFsWatcher();
setInterval(scanDbForUpdates, 5000);

