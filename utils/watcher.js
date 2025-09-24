import chokidar from "chokidar";
import path from "path";
import fs from "fs";
import db from "../db.js";
import convertToHls from "./hlsconvert.js";
import { findFileByNameInsensitive } from "./fileFinder.js";
import { exec } from "child_process";

const UPLOADS_DIR = path.join(process.cwd(), "public/uploads");
const HLS_DIR = path.join(process.cwd(), "public/hls");
const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm)$/i;
const PROCESSED_FILE = path.join(process.cwd(), "processedVideos.json");

// ✅ Load cache so initial scan doesn’t repeat work
let processedFiles = new Set();
if (fs.existsSync(PROCESSED_FILE)) {
  try {
    processedFiles = new Set(JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf-8")));
  } catch {
    console.warn("⚠️ Failed to load processed cache, starting fresh.");
  }
}
const saveProcessed = () =>
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...processedFiles], null, 2));

// ✅ Skip corrupted/incomplete files
const isValidVideo = (filePath) =>
  new Promise((resolve) =>
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      (err, stdout) =>
        resolve(!err && stdout && !isNaN(parseFloat(stdout)) && parseFloat(stdout) > 0)
    )
  );

const hlsExists = (outputDir) =>
  fs.existsSync(path.join(outputDir, "index.m3u8"));

// ✅ Core processing
async function processVideo(filePath) {
  if (!VIDEO_EXT.test(filePath) || processedFiles.has(filePath)) return;
  processedFiles.add(filePath);

  const fileName = path.basename(filePath);
  const baseName = path.parse(fileName).name;
  const outputDir = path.join(HLS_DIR, baseName);

  if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  if (!(await isValidVideo(filePath))) {
    console.warn(`❌ Skipping corrupted/invalid file: ${fileName}`);
    saveProcessed();
    return;
  }

  if (hlsExists(outputDir)) {
    console.log(`⚠️ Already has HLS → skipping: ${fileName}`);
    saveProcessed();
    return;
  }

  try {
    // 🔄 Convert video → HLS
    const hlsPath = await convertToHls(filePath, outputDir, "index");
    console.log(`✅ HLS conversion completed: ${hlsPath}`);
    const hlsRelativePath = path.relative(path.join(process.cwd(), "public"), hlsPath);

    // 🔄 Update DB (scan all tables/columns that have video_hls_path)
    const [tables] = await db.query("SHOW TABLES");
    for (const t of tables) {
      const table = Object.values(t)[0];
      const [columns] = await db.query(`SHOW COLUMNS FROM ${table}`);
      const colNames = columns.map((c) => c.Field);

      if (!colNames.includes("video_hls_path")) continue;

      // find the actual uploaded file (case-insensitive)
      const matchedFile = findFileByNameInsensitive(
        fileName,
        path.join(process.cwd(), "public/uploads")
      );
      if (!matchedFile) continue;

      const relativePath = path.relative(path.join(process.cwd(), "public"), matchedFile);

      // loop through each column, try finding match
      for (const col of colNames) {
        if (col === "video_hls_path" || col === "id") continue;

        const [rows] = await db.query(
          `SELECT id FROM ${table} WHERE ${col} LIKE ? LIMIT 1`,
          [`%${path.basename(relativePath)}%`]
        );

        if (rows.length) {
          await db.query(
            `UPDATE ${table} SET video_hls_path = ? WHERE id = ?`,
            [hlsRelativePath, rows[0].id]
          );
          console.log(`✅ DB updated in ${table} (col: ${col}) for ${fileName}`);
          break; // stop scanning other cols
        }
      }
    }
  } catch (err) {
    console.error(`❌ Conversion failed for ${fileName}:`, err.message);
  } finally {
    saveProcessed();
  }
}

// ✅ Queue (only 1 video at a time)
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

// ✅ Initial scan (only once thanks to cache)
const initialScan = (dir = UPLOADS_DIR) => {
  for (const f of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, f);
    if (fs.statSync(fullPath).isDirectory()) {
      initialScan(fullPath);
    } else {
      enqueueFile(fullPath);
    }
  }
};

// ✅ Watch for new files
const startWatcher = () => {
  const watcher = chokidar.watch(UPLOADS_DIR, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    depth: 2,
    ignoreInitial: true
  });
  watcher.on("add", (filePath) => {
    console.log(`📥 New file detected: ${filePath}`);
    enqueueFile(filePath);
  });
};

console.log("👀 Starting video watcher...");
initialScan();
startWatcher();
