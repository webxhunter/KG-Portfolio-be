import fs from "fs";
import path from "path";
import { exec } from "child_process";
import convertToHls from "./hlsconvert.js";

const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm)$/i;

// ✅ Check if a file is a valid playable video
export const isValidVideo = (filePath) =>
  new Promise((resolve) =>
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      (err, stdout) =>
        resolve(!err && stdout && !isNaN(parseFloat(stdout)) && parseFloat(stdout) > 0)
    )
  );

// ✅ Check if HLS exists for a resolution
export function hlsExists(outputDir, baseName, resolution) {
  const playlist = path.join(outputDir, `${baseName}_${resolution}p.m3u8`);
  return fs.existsSync(playlist);
}

// ✅ Validate playlist & its segments
export function validateHls(outputDir, baseName, resolution) {
  const playlist = path.join(outputDir, `${baseName}_${resolution}p.m3u8`);
  if (!fs.existsSync(playlist)) return false;

  try {
    const content = fs.readFileSync(playlist, "utf-8");
    const segments = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    if (!segments.length) return false;

    for (const seg of segments) {
      if (!fs.existsSync(path.join(outputDir, seg))) {
        console.warn(`⚠️ Missing segment: ${seg}`);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error("⚠️ Validation error:", err.message);
    return false;
  }
}

// ✅ Retry wrapper (for conversion retries)
export async function retryConvert(fn, retries = 1) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Retry attempt ${i + 1} failed`);
    }
  }
  throw lastError;
}

// ✅ Convert a video into all resolutions (360, 720, 1080)
export async function convertAndValidate(inputPath, outputDir, baseName) {
  const resolutions = ["360", "720","1080"];
  let allValid = true;

  for (const res of resolutions) {
    if (hlsExists(outputDir, baseName, res) && validateHls(outputDir, baseName, res)) {
      console.log(`ℹ️ ${res}p already valid → skipping`);
      continue;
    }

    console.warn(`⚠️ Missing/incomplete ${res}p → converting...`);
    try {
      await retryConvert(() => convertToHls(inputPath, outputDir, baseName, res), 1);
    } catch (err) {
      console.error(`❌ Failed ${res}p even after retry:`, err.message);
    }

    if (!validateHls(outputDir, baseName, res)) {
      allValid = false;
    }
  }
  return allValid;
}

export { VIDEO_EXT };
