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
const processingNow = new Set();
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
// Adaptive wait for file stability
// --------------------
async function waitUntilStableAdaptive(filePath, maxWaitMs = 60 * 60 * 1000) {
  if (!fs.existsSync(filePath)) return false;
  const size = fs.statSync(filePath).size;
  const stableChecks = size < 10_000_000 ? 2 : size < 100_000_000 ? 3 : 5;
  return await waitUntilStable(filePath, maxWaitMs, stableChecks);
}

// --------------------
// Find DB record for a filename
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
// Process single file
// --------------------
async function processSingleFile(filePath, options = {}) {
  const filename = path.basename(filePath);
  if (processingNow.has(filename)) return;

  processingNow.add(filename);
  const baseName = path.parse(filePath).name;
  const outputDir = path.join(HLS_DIR, baseName);

  try {
    const stable = await waitUntilStableAdaptive(filePath);
    if (!stable) return;

    const valid = await isValidVideo(filePath);
    if (!valid) return;

    if (options.isUpdate) {
      removeOldHls(baseName);
      processedSet.delete(filename);
      saveProcessedSet();
    }

    fs.mkdirSync(outputDir, { recursive: true });
    await convertToHls(filePath, outputDir, baseName);

    const hlsRelative = `/hls/${baseName}.m3u8`;
    if (options.dbTarget) await updateDbRecordHls(options.dbTarget.table, options.dbTarget.id, hlsRelative);

    processedSet.add(filename);
    saveProcessedSet();
    console.log(`🏁 Done: ${filename} → HLS created & DB updated`);
  } catch (err) {
    console.error("❌ processSingleFile error:", err.message || err);
  } finally {
    processingNow.delete(filename);
  }
}

// --------------------
// FS Watcher (for new uploads)
// --------------------
function startFsWatcher() {
  const watcher = chokidar.watch(UPLOADS_DIR, { ignored: /(^|[\/\\])\../, persistent: true, depth: 2, ignoreInitial: true });

  watcher.on("add", async filePath => {
    if (!VIDEO_EXT.test(filePath)) return;

    const rec = await findDbRecordForFilename(path.basename(filePath));
    if (!rec) return;

    // New file upload triggers HLS immediately
    await processSingleFile(filePath, { dbTarget: { table: rec.table, id: rec.id }, isUpdate: false });
  });

  watcher.on("unlink", filePath => {
    if (!VIDEO_EXT.test(filePath)) return;
    removeOldHls(path.parse(filePath).name);
    const filename = path.basename(filePath);
    processedSet.delete(filename);
    saveProcessedSet();
  });

  console.log("👀 FS watcher started");
}

// --------------------
// DB Watcher (for updates / renamed files)
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
        const [rows] = await pool.query(`SELECT id, \`${vc.Field}\` AS video_path, video_hls_path FROM \`${table}\``);
        for (const rec of rows) {
          if (!rec.video_path || !VIDEO_EXT.test(rec.video_path)) continue;

          const originalBase = path.parse(rec.video_path).name;
          const currentHlsBase = rec.video_hls_path ? path.parse(rec.video_hls_path).name : null;

          const filePath = findFileByNameInsensitive(path.basename(rec.video_path), UPLOADS_DIR);
          if (!filePath) continue;

          let isUpdate = false;
          if (!currentHlsBase) {
            console.log(`🔄 DB-triggered NEW video: ${path.basename(filePath)} (table: ${table}, col: ${vc.Field})`);
          } else if (originalBase !== currentHlsBase) {
            console.log(`🔄 DB-triggered UPDATE (filename mismatch): ${path.basename(filePath)}`);
            isUpdate = true;
          } else {
            continue; // already processed correctly
          }

          await processSingleFile(filePath, { dbTarget: { table: rec.table, id: rec.id }, isUpdate });
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
// Start watcher
// --------------------
console.log("👀 Starting watcher (FS + DB)...");
console.log("📂 Uploads:", UPLOADS_DIR);
console.log("📂 HLS:", HLS_DIR);

startFsWatcher();
setInterval(scanDbForUpdates, 1000);

