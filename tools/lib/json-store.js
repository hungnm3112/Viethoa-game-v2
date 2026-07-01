import fs from "node:fs";
import path from "node:path";

export function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(tempPath, "w");
  try {
    fs.writeSync(fd, `${JSON.stringify(value, null, 2)}\n`, null, "utf8");
    fs.fsyncSync(fd); // force to physical disk so a power loss can't drop this write from the OS cache
  } finally {
    fs.closeSync(fd);
  }
  renameWithRetry(tempPath, filePath);
}

function renameWithRetry(tempPath, filePath) {
  let lastError = null;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      fs.renameSync(tempPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      if (error.code !== "EPERM" && error.code !== "EACCES") break;
      sleepSync(50);
    }
  }

  // Windows: rename fails when destination is held open by another process (e.g. dashboard browser).
  // copyFile overwrites even when the destination is being read.
  try {
    fs.copyFileSync(tempPath, filePath);
    try { fs.rmSync(tempPath, { force: true }); } catch { /* best-effort */ }
    return;
  } catch {
    // copyFile also failed; fall through to throw original rename error.
  }

  try {
    fs.rmSync(tempPath, { force: true });
  } catch {
    // Best-effort cleanup only.
  }
  throw lastError;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
