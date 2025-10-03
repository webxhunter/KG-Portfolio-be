import chokidar from "chokidar";
import path from "path";
import fs from "fs";
import db from "../db.js";
import { findFileByNameInsensitive } from "./fileFinder.js";
import {
  isValidVideo,
  convertAndValidate,
  VIDEO_EXT,
} from "./helpers.js";

const UPLOADS_DIR = path.join(process.cwd(), "public/uploads");
const HLS_DIR = path.join(process.cwd(), "public/hls");
const PROCESSED_FILE = path.join(process.cwd(), "processedVideos.json");

// ✅ Load processed cache
let processedFiles = new Set();
if (fs.existsSync(PROCESSED_FILE)) {
  try {
    processedFiles = new Set(JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf-8")));
  } catch {
    console.warn("⚠️ Failed to load cache, starting fresh.");
  }
}
const saveProcessed = () =>
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...processedFiles], null, 2));

// ✅ Core video processing
async function processVideo(filePath) {
  if (!VIDEO_EXT.test(filePath) || processedFiles.has(filePath)) return;
  processedFiles.add(filePath);

  const fileName = path.basename(filePath);
  const baseName = path.parse(fileName).name;
  const outputDir = path.join(HLS_DIR, baseName);

  if (!(await isValidVideo(filePath))) {
    console.warn(`❌ Invalid/corrupted file: ${fileName}`);
    saveProcessed();
    return;
  }

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const allValid = await convertAndValidate(filePath, outputDir, baseName);

  if (allValid) {
    const hlsRelativePath = path.join("hls", `${baseName}.m3u8`);

    // 🔄 Update DB for this video only
    const [tables] = await db.query("SHOW TABLES");
    for (const t of tables) {
      const table = Object.values(t)[0];
      const [columns] = await db.query(`SHOW COLUMNS FROM ${table}`);
      const colNames = columns.map((c) => c.Field);
      if (!colNames.includes("video_hls_path")) continue;

      const matchedFile = findFileByNameInsensitive(fileName, UPLOADS_DIR);
      if (!matchedFile) continue;

      let updated = false;

      for (const col of colNames) {
        if (col === "video_hls_path" || col === "id") continue;

        // First try with folder path
        let [rows] = await db.query(
          `SELECT id FROM ${table} WHERE ${col} LIKE ? LIMIT 1`,
          [`%${path.relative(path.join(process.cwd(), "public/uploads"), matchedFile)}%`]
        );

        // If not found, fallback to filename only
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
          console.log(`✅ DB updated in ${table} (col: ${col}) for ${fileName}`);
          updated = true;
          break; // Only update one matching column per table
        }
      }

      if (!updated) {
        console.warn(`❌ No DB record found in ${table} for ${fileName}`);
      }
    }

    console.log(`✅ Completed all resolutions for ${fileName}`);
  } else {
    console.warn(`⚠️ Some resolutions incomplete for ${fileName}`);
  }

  saveProcessed();
}

// ✅ Queue (1 at a time)
const fileQueue = [];
let isProcessing = false;
const processQueue = async () => {
  if (isProcessing || !fileQueue.length) return;
  isProcessing = true;
  await processVideo(fileQueue.shift());
  setTimeout(() => {
    isProcessing = false;
    processQueue();
  }, 2000);
};
const enqueueFile = (filePath) => {
  if (VIDEO_EXT.test(filePath) && !processedFiles.has(filePath)) {
    fileQueue.push(filePath);
    processQueue();
  }
};

// ✅ Initial scan
const initialScan = (dir = UPLOADS_DIR) => {
  for (const f of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, f);
    if (fs.statSync(fullPath).isDirectory()) initialScan(fullPath);
    else enqueueFile(fullPath);
  }
};

// ✅ Watch new uploads or updates
const startWatcher = () => {
  const watcher = chokidar.watch(UPLOADS_DIR, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    depth: 2,
    ignoreInitial: true,
  });

  // 🆕 Handle new videos
  watcher.on("add", (filePath) => {
    if (VIDEO_EXT.test(filePath)) {
      console.log(`📥 New video detected: ${filePath}`);
      enqueueFile(filePath);
    }
  });

  // ♻️ Handle updated/replaced videos
  watcher.on("change", async (filePath) => {
    if (VIDEO_EXT.test(filePath)) {
      console.log(`♻️ Video updated: ${filePath}`);

      // Remove from processed cache
      processedFiles.delete(filePath);
      saveProcessed();

      // Delete old HLS folder
      const fileName = path.basename(filePath);
      const baseName = path.parse(fileName).name;
      const outputDir = path.join(HLS_DIR, baseName);
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
        console.log(`🧹 Deleted old HLS folder for ${baseName}`);
      }

      // Reconvert and update DB
      enqueueFile(filePath);
    }
  });
};
