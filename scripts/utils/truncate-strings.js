// scripts/truncate-strings.js
// Utility to safely truncate Vietnamese strings to fit original byte limits.
// Uses an optional abbreviation table (scripts/abbrev-table.json) for smarter shortening.

import fs from "node:fs";
import path from "node:path";

/** Load abbreviation map if exists */
let abbrevMap = {};
const abbrevPath = path.resolve("scripts", "abbrev-table.json");
if (fs.existsSync(abbrevPath)) {
  try {
    abbrevMap = JSON.parse(fs.readFileSync(abbrevPath, "utf8"));
  } catch (e) {
    console.warn("Failed to parse abbrev-table.json", e);
  }
}

/**
 * Shortens a string to a maximum byte length.
 * First tries to apply word‑level abbreviations from abbrevMap.
 * If still too long, truncates at a valid UTF‑8 boundary.
 */
export function truncateString(str, maxBytes) {
  let bytes = Buffer.from(str, "utf8");
  if (bytes.length <= maxBytes) return str;

  // First, attempt to apply word-level abbreviations from abbrevMap
  if (Object.keys(abbrevMap).length) {
    let shortened = str;
    for (const [full, abbr] of Object.entries(abbrevMap)) {
      const regex = new RegExp(full, "g");
      shortened = shortened.replace(regex, abbr);
    }
    if (Buffer.from(shortened, "utf8").length <= maxBytes) return shortened;
    
    // If still too long even after abbreviation, use the shortened version for raw truncation
    str = shortened;
    bytes = Buffer.from(str, "utf8");
  }

  // Final fallback: attempt raw truncation at a valid UTF-8 boundary
  let cut = maxBytes;
  while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) {
    cut -= 1;
  }
  if (cut === 0) return ""; // cannot fit any character
  let truncated = bytes.slice(0, cut).toString("utf8");

  // Prevent cutting in the middle of a format specifier (e.g. %d, %s, %1$s, %%) or an XML tag (<font>)
  let safe = false;
  while (!safe) {
    safe = true;
    
    // Check for open HTML tag without closing
    const lastOpenTag = truncated.lastIndexOf('<');
    const lastCloseTag = truncated.lastIndexOf('>');
    if (lastOpenTag > lastCloseTag) {
      truncated = truncated.slice(0, lastOpenTag);
      safe = false;
      continue;
    }
    
    // Check for dangling % or incomplete format specifier.
    const lastPercent = truncated.lastIndexOf('%');
    if (lastPercent !== -1) {
      const afterPercent = truncated.slice(lastPercent);
      // Valid specifiers: %% or ends with a letter. We regex test to ensure it's fully formed.
      // If afterPercent contains a space, then the % was probably not a format specifier but we shouldn't have spaces inside specifiers anyway.
      // A broken specifier will look like "%", "%1", "%1$", "%.2"
      // If it's fully formed, it will match exactly at the start.
      const match = afterPercent.match(/^%([0-9]*\$?[0-9]*\.?[0-9]*[a-zA-Z]|%)/);
      if (!match) {
        // It's a broken format specifier (or an invalid % that would crash sprintf anyway)
        truncated = truncated.slice(0, lastPercent);
        safe = false;
        continue;
      }
    }
  }

  return truncated;
}

// Export for use by other scripts
export default { truncateString };
