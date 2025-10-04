import dotenv from "dotenv";
dotenv.config();

import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import pool from "../db.js";
import {
  VIDEO_EXT,
  isValidVideo,
  waitUntilStable,
  convertAndValidate,
} from "./helpers.js";
import { findFileByNameInsensitive } from "./fileFinder.js";

const PROJECT_ROOT = path.resolve(process.cwd());
const UPLOADS_DIR = path.join(PROJECT_ROOT, "public/uploads");
const HLS_DIR = path.join(PROJECT_ROOT, "public/hls");
const PROCESSED_JSON = path.join(PROJECT_ROOT, "processedVideos.json");

const pendingUpdates = new Set();
let isProcessing = false;
let isScanning = false;

function loadProcessedSet() {
  try {
    if (!fs.existsSync(PROCESSED_JSON)) return new Set();
    const arr = JSON.parse(fs.readFileSync(PROCESSED_JSON, "utf-8"));
    return new Set(arr);
  } catch (err) {
    console.warn("⚠️ Failed to load processedVideos.json, starting empty.");
    return new Set();
  }
}
function saveProcessedSet(set) {
  try {
    fs.writeFileSync(PROCESSED_JSON, JSON.stringify([...set], null, 2));
  } catch (err) {
    console.error("⚠️ Failed to save processedVideos.json:", err.message || err);
  }
}
let processedSet = loadProcessedSet();

// Remove any entries whose path includes baseName
function removeProcessedEntriesByBase(baseName) {
  let changed = false;
  for (const p of [...processedSet]) {
    if (p.includes(baseName)) {
      processedSet.delete(p);
      changed = true;
      console.log(`🗑️ Removed from processed list: ${p}`);
    }
  }
  if (changed) saveProcessedSet(processedSet);
}

async function waitUntilStableAdaptive(filePath, maxWaitMs = 60 * 60 * 1000) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ File does not exist for stability check: ${filePath}`);
      return false;
    }
    const stats = fs.statSync(filePath);
    const size = stats.size;
    let stableChecks = 3;
    if (size < 10_000_000) stableChecks = 2; // <10MB
    else if (size < 100_000_000) stableChecks = 3; // 10-100MB
    else stableChecks = 5; // >100MB

    console.log(`ℹ️ Adaptive stability settings for ${path.basename(filePath)}: size=${size} bytes, stableChecks=${stableChecks}, maxWait=${maxWaitMs}ms`);
    return await waitUntilStable(filePath, maxWaitMs, stableChecks);
  } catch (err) {
    console.error("⚠️ waitUntilStableAdaptive error:", err && err.message ? err.message : err);
    return false;
  }
}

async function findDbRecordForFilename(filename) {
  try {
    const [tables] = await pool.query("SHOW TABLES");
    for (const t of tables) {
      const table = Object.values(t)[0];
      const [cols] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);

      // skip tables without video_hls_path because we need to write there
      const hasHls = cols.some((c) => c.Field === "video_hls_path");
      if (!hasHls) continue;

      // find candidate columns that likely hold video paths
      const videoCols = cols.filter((c) => /video/i.test(c.Field));
      if (videoCols.length === 0) continue;

      for (const vc of videoCols) {
        const sql = `SELECT id, \`${vc.Field}\` AS video_path, video_hls_path FROM \`${table}\` WHERE \`${vc.Field}\` LIKE ? LIMIT 1`;
        const [rows] = await pool.query(sql, [`%${filename}%`]);
        if (rows && rows.length) {
          return {
            table,
            column: vc.Field,
            id: rows[0].id,
            video_path: rows[0].video_path,
            video_hls_path: rows[0].video_hls_path,
          };
        }
      }
    }
    return null;
  } catch (err) {
    console.error("⚠️ findDbRecordForFilename error:", err.message || err);
    return null;
  }
}

// Update a single DB row's video_hls_path using table + id
async function updateDbRecordHls(table, id, hlsPath) {
  try {
    const sql = `UPDATE \`${table}\` SET video_hls_path = ? WHERE id = ?`;
    await pool.query(sql, [hlsPath, id]);
    console.log(`💾 DB updated for table "${table}" id=${id} → ${hlsPath}`);
  } catch (err) {
    console.error(`⚠️ Failed to update DB (${table} id=${id}):`, err.message || err);
    throw err;
  }
}

async function processPendingUpdates() {
  if (isProcessing) return;
  if (pendingUpdates.size === 0) return;

  // take first item
  const filePath = pendingUpdates.values().next().value;
  pendingUpdates.delete(filePath);

  await processSingleFile(filePath);
  setImmediate(processPendingUpdates);
}

// Main worker: process a single filePath (convert + update only the targeted DB row)
async function processSingleFile(filePath, options = {}) {
  if (isProcessing) {
    pendingUpdates.add(filePath);
    console.log(`⏳ Busy - re-queued: ${path.basename(filePath)}`);
    return;
  }

  isProcessing = true;
  const baseName = path.parse(filePath).name;
  const filename = path.basename(filePath);
  const outputDir = path.join(HLS_DIR, baseName);

  try {
    console.log(`📁 Checking file stability for: ${filePath}`);
    const stable = await waitUntilStableAdaptive(filePath, 60 * 60 * 1000 /* 1 hour */);
    if (!stable) {
      console.warn(`⚠️ Not stable / missing: ${filePath} → skipping for now`);
      isProcessing = false;
      if (!pendingUpdates.has(filePath)) {
        pendingUpdates.add(filePath);
        console.log(`⏳ Queued for retry later: ${filename}`);
      }
      return;
    }

    console.log(`✅ File stable: ${filePath}`);

    const valid = await isValidVideo(filePath);
    if (!valid) {
      console.warn(`⚠️ Not a valid playable video: ${filePath} → skipping`);
      isProcessing = false;
      return;
    }

    // if update, remove old HLS chunks and processed JSON entries by base
    if (options.isUpdate) {
      console.log(`♻️ Update flagged — cleaning old HLS for: ${baseName}`);
      removeOldHls(baseName);
      removeProcessedEntriesByBase(baseName);
    }
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`🎬 Converting: ${filename} → HLS (all resolutions)`);
    const ok = await convertAndValidate(filePath, outputDir, baseName);

    if (!ok) {
      console.warn(`⚠️ Conversion incomplete/failed for ${baseName}`);
      isProcessing = false;
      return;
    }

    console.log(`✅ Conversion complete for ${baseName}`);
    const hlsRelative = `/hls/${baseName}.m3u8`;

    // If dbTarget provided (DB scan found specific row), update that row only.
    if (options.dbTarget && options.dbTarget.table && options.dbTarget.id) {
      await updateDbRecordHls(options.dbTarget.table, options.dbTarget.id, hlsRelative);
    } else {
      const rec = await findDbRecordForFilename(filename);
      if (rec && rec.table && rec.id) {
        await updateDbRecordHls(rec.table, rec.id, hlsRelative);
      } else {
        console.warn(`⚠️ No DB row found to update for file: ${filename}`);
      }
    }

    // mark processed
    processedSet.add(filePath);
    saveProcessedSet(processedSet);

    console.log(`🏁 Done: ${filename} — HLS saved and DB updated (if matched)`);
  } catch (err) {
    console.error("❌ processSingleFile error:", err && err.message ? err.message : err);
  } finally {
    isProcessing = false;
  }
}

// helper: remove old HLS folder for baseName
function removeOldHls(baseName) {
  const dir = path.join(HLS_DIR, baseName);
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`🗑️ Removed old HLS directory: ${dir}`);
    } catch (err) {
      console.warn(`⚠️ Could not remove HLS dir ${dir}: ${err.message}`);
    }
  }
}

async function scanDbForChangedFiles() {
  if (isScanning) return;
  isScanning = true;

  try {
    const [tables] = await pool.query("SHOW TABLES");
    for (const t of tables) {
      const table = Object.values(t)[0];
      if (!table) continue;

      const [cols] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
      const hasHls = cols.some((c) => c.Field === "video_hls_path");
      if (!hasHls) {
        continue;
      }
      const videoCols = cols.filter((c) => /video/i.test(c.Field));
      if (videoCols.length === 0) continue;

      for (const vc of videoCols) {
        const sql = `SELECT id, \`${vc.Field}\` AS video_path, video_hls_path FROM \`${table}\` WHERE \`${vc.Field}\` IS NOT NULL`;
        const [rows] = await pool.query(sql);

        for (const rec of rows) {
          const vpath = rec.video_path;
          if (typeof vpath !== "string" || !VIDEO_EXT.test(vpath)) continue;

          const filename = path.basename(vpath);
          const filePath = findFileByNameInsensitive(filename, UPLOADS_DIR);
          if (!filePath) continue;

          const expectedHls = `/hls/${path.parse(filePath).name}.m3u8`;
          const alreadyProcessed = processedSet.has(filePath);

          // Case A: New (DB row has null hls and we haven't processed file yet)
          if (!rec.video_hls_path && !alreadyProcessed) {
            console.log(`🔄 DB-triggered NEW video: ${filename} (table: ${table}, col: ${vc.Field})`);
            pendingUpdates.add(filePath);
            if (!isProcessing) {
              pendingUpdates.delete(filePath);
              await processSingleFile(filePath, { dbTarget: { table, id: rec.id }, isUpdate: false });
            } else {
              console.log(`⏳ Busy — queued new video for later: ${filename}`);
            }
            continue;
          }

          // Case B: processed exists but DB hls filename is different → treat as update
          if (alreadyProcessed && rec.video_hls_path) {
            const dbHlsFile = path.basename(rec.video_hls_path);
            const expectedHlsFile = path.basename(expectedHls);

            if (dbHlsFile !== expectedHlsFile) {
              console.log(`♻️ DB update detected for: ${filename} (table: ${table}) — queued for regen`);
              pendingUpdates.add(filePath);
              if (!isProcessing) {
                pendingUpdates.delete(filePath);
                await processSingleFile(filePath, { dbTarget: { table, id: rec.id }, isUpdate: true });
              } else {
                console.log(`⏳ Busy — queued update for later: ${filename}`);
              }
              continue;
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("⚠️ DB scan error:", err && err.message ? err.message : err);
  } finally {
    isScanning = false;
  }
}

function startFsWatcher() {
  const watcher = chokidar.watch(UPLOADS_DIR, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    depth: 2,
    ignoreInitial: true,
  });

  watcher.on("add", async (filePath) => {
    if (!VIDEO_EXT.test(filePath)) return;
    console.log(`📥 New file detected: ${filePath}`);

    // find DB row for this filename and process only that row
    const rec = await findDbRecordForFilename(path.basename(filePath));
    if (!rec) {
      console.log(`⏭️ No DB record found for new file: ${path.basename(filePath)} — skipping`);
      return;
    }
    const isUpdate = !!rec.video_hls_path;
    pendingUpdates.add(filePath);
    if (!isProcessing) {
      pendingUpdates.delete(filePath);
      await processSingleFile(filePath, { dbTarget: { table: rec.table, id: rec.id }, isUpdate });
    } else {
      console.log(`⏳ Busy — queued new upload for later: ${path.basename(filePath)}`);
    }
  });

  watcher.on("change", async (filePath) => {
    if (!VIDEO_EXT.test(filePath)) return;
    console.log(`♻️ File changed: ${filePath}`);

    const rec = await findDbRecordForFilename(path.basename(filePath));
    if (!rec) {
      console.log(`⏭️ No DB record found for changed file: ${path.basename(filePath)} — skipping`);
      return;
    }

    // always treat change as update (regenerate hls)
    pendingUpdates.add(filePath);
    if (!isProcessing) {
      pendingUpdates.delete(filePath);
      await processSingleFile(filePath, { dbTarget: { table: rec.table, id: rec.id }, isUpdate: true });
    } else {
      console.log(`⏳ Busy — queued changed file for later: ${path.basename(filePath)}`);
    }
  });

  watcher.on("unlink", (filePath) => {
    if (!VIDEO_EXT.test(filePath)) return;
    console.log(`🗑️ File removed: ${filePath}`);
    const baseName = path.parse(filePath).name;
    removeOldHls(baseName);
    // remove from processed set if present
    if (processedSet.has(filePath)) {
      processedSet.delete(filePath);
      saveProcessedSet(processedSet);
      console.log(`🗂️ Removed from processed list due to delete : ${filePath}`);
    }
  });

  watcher.on("error", (err) => console.error("⚠️ Watcher error:", err));
  console.log("👀 FS watcher started (uploads).");
}

console.log("👀 Starting unified watcher (FS + DB)...");
console.log("📂 Uploads:", UPLOADS_DIR);
console.log("📂 HLS:", HLS_DIR);
startFsWatcher();
setInterval(scanDbForChangedFiles, 1000);

