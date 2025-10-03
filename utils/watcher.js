import dotenv from "dotenv";
dotenv.config();
import chokidar from "chokidar";
import path from "path";
import fs from "fs";
import db from "../db.js";
import { findFileByNameInsensitive } from "./fileFinder.js";
import { isValidVideo, VIDEO_EXT } from "./helpers.js";
import convertToHls from "./hlsconvert.js"; 

const PROJECT_ROOT = process.cwd();
const UPLOADS_DIR = path.join(PROJECT_ROOT, "public/uploads");
const HLS_DIR = path.join(PROJECT_ROOT, "public/hls");
const PROCESSED_FILE = path.join(PROJECT_ROOT, "processedVideos.json");

// Load processed cache
let processedFiles = new Set();
if (fs.existsSync(PROCESSED_FILE)) {
  try {
    processedFiles = new Set(JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf-8")));
  } catch {
    console.warn("⚠️ Failed to load cache, starting fresh.");
    processedFiles = new Set();
  }
}
const saveProcessed = () =>
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...processedFiles], null, 2));

// Remove processed entries by base name
function removeProcessedEntriesByBase(baseName) {
  const toRemove = [...processedFiles].filter(p => p.includes(baseName));
  toRemove.forEach(p => processedFiles.delete(p));
  saveProcessed();
}

// ✅ Process one video
async function processVideo(filePath) {
  try {
    const absPath = path.resolve(filePath);
    if (!VIDEO_EXT.test(absPath) || processedFiles.has(absPath)) return;
    processedFiles.add(absPath);

    const fileName = path.basename(absPath);
    const baseName = path.parse(fileName).name;
    const outputDir = path.join(HLS_DIR, baseName);

    console.log(`▶️ Processing: ${fileName}`);

    if (!(await isValidVideo(absPath))) {
      console.warn(`❌ Invalid/corrupted file: ${fileName}`);
      saveProcessed();
      return;
    }

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const masterPlaylistPath = await convertToHls(absPath, outputDir, baseName);

    // Update DB only for this video
    const hlsRelativePath = path.posix.join("hls", baseName, `${baseName}.m3u8`);
    const [tables] = await db.query("SHOW TABLES");
    for (const t of tables) {
      const table = Object.values(t)[0];
      const [columns] = await db.query(`SHOW COLUMNS FROM ${table}`);
      const colNames = columns.map(c => c.Field);
      if (!colNames.includes("video_hls_path")) continue;

      const matchedFile = findFileByNameInsensitive(fileName, UPLOADS_DIR);
      if (!matchedFile) continue;

      let updated = false;
      for (const col of colNames) {
        if (col === "video_hls_path" || col === "id") continue;

        let [rows] = await db.query(
          `SELECT id FROM ${table} WHERE ${col} LIKE ? LIMIT 1`,
          [`%${path.relative(UPLOADS_DIR, matchedFile)}%`]
        );

        if (!rows.length) {
          [rows] = await db.query(
            `SELECT id FROM ${table} WHERE ${col} LIKE ? LIMIT 1`,
            [`%${fileName}%`]
          );
        }

        if (rows.length) {
          await db.query(
            `UPDATE ${table} SET video_hls_path = ? WHERE id = ?`,
            [hlsRelativePath, rows[0].id]
          );
          console.log(`✅ DB updated in ${table} for ${fileName} → ${hlsRelativePath}`);
          updated = true;
          break;
        }
      }

      if (!updated) console.warn(`❌ No DB record found in ${table} for ${fileName}`);
    }

    console.log(`✅ Completed HLS for ${fileName}`);
  } catch (err) {
    console.error("❌ Error processing video:", err?.message || err);
  } finally {
    saveProcessed();
  }
}

// Queue for 1 video at a time
const fileQueue = [];
let isProcessing = false;
const processQueue = async () => {
  if (isProcessing || !fileQueue.length) return;
  isProcessing = true;
  const filePath = fileQueue.shift();
  await processVideo(filePath);
  setTimeout(() => {
    isProcessing = false;
    processQueue();
  }, 2000);
};
const enqueueFile = filePath => {
  const absPath = path.resolve(filePath);
  if (VIDEO_EXT.test(absPath) && !processedFiles.has(absPath)) {
    fileQueue.push(absPath);
    console.log(`🗂 Enqueued: ${absPath} (queue size: ${fileQueue.length})`);
    processQueue();
  }
};

// Watcher
const startWatcher = () => {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });

  const watcher = chokidar.watch(UPLOADS_DIR, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    depth: 2,
    ignoreInitial: true,
  });

  watcher.on("add", filePath => {
    if (VIDEO_EXT.test(filePath)) {
      console.log(`📥 New video detected: ${filePath}`);
      const baseName = path.parse(path.basename(filePath)).name;
      removeProcessedEntriesByBase(baseName);
      const oldOutput = path.join(HLS_DIR, baseName);
      if (fs.existsSync(oldOutput)) fs.rmSync(oldOutput, { recursive: true, force: true });
      enqueueFile(filePath);
    }
  });

  watcher.on("change", filePath => {
    if (VIDEO_EXT.test(filePath)) {
      console.log(`♻️ Video changed: ${filePath}`);
      const baseName = path.parse(path.basename(filePath)).name;
      removeProcessedEntriesByBase(baseName);
      const outputDir = path.join(HLS_DIR, baseName);
      if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
      processedFiles.delete(path.resolve(filePath));
      saveProcessed();
      enqueueFile(filePath);
    }
  });

  watcher.on("unlink", filePath => {
    if (VIDEO_EXT.test(filePath)) {
      console.log(`🗑️ Source video deleted: ${filePath}`);
      const baseName = path.parse(path.basename(filePath)).name;
      const outputDir = path.join(HLS_DIR, baseName);
      if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
      removeProcessedEntriesByBase(baseName);
    }
  });

  watcher.on("error", err => console.error("⚠️ Watcher error:", err));
  console.log("👀 Watcher started, monitoring uploads...");
};
console.log("👀 Starting video watcher...");
console.log(`📂 Uploads dir: ${UPLOADS_DIR}`);
console.log(`📂 HLS dir: ${HLS_DIR}`);
startWatcher();
