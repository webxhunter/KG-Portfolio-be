import fs from "fs";
import path from "path";

export function findFileByNameInsensitive(fileName, baseDir) {
  let result = null;

  function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, f);
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (path.basename(f).toLowerCase() === fileName.toLowerCase()) {
        result = fullPath;
        return;
      }
    }
  }

  walk(baseDir);
  return result;
}
