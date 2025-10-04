import fs from "fs";
import path from "path";
import { exec } from "child_process";
import convertToHls from "./hlsconvert.js";

// ✅ Supported video extensions
export const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm)$/i;

// ✅ Check if a file is a valid playable video using ffprobe
export const isValidVideo = (filePath) =>
  new Promise((resolve) =>
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      (err, stdout) => {
        if (err || !stdout) return resolve(false);
        const duration = parseFloat(stdout);
        resolve(!isNaN(duration) && duration > 0);
      }
    )
  );

// ✅ Wait until file is fully uploaded/stable
// Waits up to `timeoutMs` and requires `stableChecks` consecutive size matches
export async function waitUntilStable(filePath, timeoutMs = 60 * 60 * 1000, stableChecks = 3) {
  const start = Date.now();
  let lastSize = -1;
  let consecutiveStable = 0;

  while (Date.now() - start < timeoutMs) {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size === lastSize) {
        consecutiveStable++;
        console.log(`ℹ️ File size stable check ${consecutiveStable}/${stableChecks}: ${filePath}`);
        if (consecutiveStable >= stableChecks) {
          return true;
        }
      } else {
        consecutiveStable = 0; 
        lastSize = stats.size;
        console.log(`ℹ️ File size changed, resetting stable counter: ${filePath} (${stats.size} bytes)`);
      }
    } catch (err) {
      console.warn(`⚠️ File not found during stability check: ${filePath}`);
      return false;
    }
    // Wait 3 seconds before next check
    await new Promise((res) => setTimeout(res, 3000));
  }

  console.warn(`⚠️ Timeout waiting for file stability: ${filePath}`);
  return false;
}

// ✅ Check if playlist exists for a given resolution
export function hlsExists(outputDir, baseName, resolution) {
  const playlist = path.join(outputDir, `${baseName}_${resolution}p.m3u8`);
  return fs.existsSync(playlist);
}

// ✅ Validate playlist and segments exist
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
    console.error(`⚠️ HLS validation error for ${baseName}_${resolution}p:`, err.message);
    return false;
  }
}

// ✅ Retry wrapper (1 retry by default)
export async function retryConvert(fn, retries = 1) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Retry attempt ${i + 1} failed: ${err.message}`);
    }
  }
  throw lastError;
}

// ✅ Convert video to HLS (all resolutions) and validate
export async function convertAndValidate(inputPath, outputDir, baseName) {
  try {
    console.log(`🎞️ Starting HLS multi-resolution conversion for: ${baseName}`);
    await retryConvert(() => convertToHls(inputPath, outputDir, baseName), 1);
  } catch (err) {
    console.error(`❌ Conversion failed for ${baseName}:`, err.message);
    return false;
  }

  const resolutions = ["360", "720", "1080"];
  for (const res of resolutions) {
    if (!validateHls(outputDir, baseName, res)) {
      console.warn(`⚠️ Validation failed for ${res}p of ${baseName}`);
      return false;
    }
  }

  console.log(`✅ All HLS variants valid for: ${baseName}`);
  return true;
}
