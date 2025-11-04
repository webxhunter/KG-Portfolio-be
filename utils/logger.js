import fs from "fs";
import path from "path";

// ----------- Configuration -----------
const LOG_DIR = "/var/log";
const LOG_FILE = path.join(LOG_DIR, "hls-converter.log");
try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (e) {
  console.error("⚠️ Failed to ensure /var/log directory:", e.message);
}

const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

// ----------- Timestamped formatter -----------
function formatMessage(type, args) {
  const time = new Date().toISOString();
  const msg = args
    .map(a => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
    .join(" ");
  return `[${time}] [${type}] ${msg}\n`;
}

// ----------- Hook console -----------
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
  const msg = formatMessage("LOG", args);
  logStream.write(msg);
  originalLog(...args);
};

console.error = (...args) => {
  const msg = formatMessage("ERROR", args);
  logStream.write(msg);
  originalError(...args);
};

console.warn = (...args) => {
  const msg = formatMessage("WARN", args);
  logStream.write(msg);
  originalWarn(...args);
};

logStream.on("open", () => {
  try {
    const stats = fs.statSync(LOG_FILE);
    if (stats.size > 10 * 1024 * 1024) {
      const rotated = `${LOG_FILE}.${Date.now()}`;
      fs.renameSync(LOG_FILE, rotated);
      console.log(`🔁 Rotated log file: ${rotated}`);
    }
  } catch (_) {}
}

);

console.log("🟢 Logger initialized →", LOG_FILE);