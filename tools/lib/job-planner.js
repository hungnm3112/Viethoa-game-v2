import fs from "node:fs";
import path from "node:path";
import { extractXmlStrings, groupForPath, normalizeText } from "./strings.js";

export function buildJobs({
  inputRoot = "input",
  maxStrings = 40,
  matchers = [],
  force = false,
} = {}) {
  const files = findFiles(inputRoot, ".xml").filter((file) => matches(file, matchers));
  const jobs = [];

  for (const file of files) {
    const inputXml = fs.readFileSync(file, "utf8");
    const sourceStrings = extractXmlStrings(inputXml).map((item) => item.value);
    if (sourceStrings.length === 0) continue;

    const translatedStrings = readTranslatedStrings(file);
    const remaining = force ? sourceStrings : sourceStrings.filter((value, index) => {
      const translated = translatedStrings[index];
      return !translated || normalizeText(translated) === normalizeText(value);
    });
    if (remaining.length === 0) continue;

    const group = groupForPath(file);
    for (let index = 0; index < remaining.length; index += maxStrings) {
      jobs.push({
        id: `${jobs.length + 1}`.padStart(5, "0"),
        group,
        inputFile: file.replaceAll("\\", "/"),
        outputFile: file.replaceAll("\\", "/").replace(/^input\//, "output/"),
        totalStringsInFile: sourceStrings.length,
        untranslatedStringsInFile: remaining.length,
        strings: remaining.slice(index, index + maxStrings),
      });
    }
  }

  jobs.sort((a, b) => priority(a) - priority(b));
  return jobs;
}

export function parsePlannerArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      result[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

export function readProfiles(filePath = "config/translation-phases.json") {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function resolveProfileMatchers(profileArg, profiles = readProfiles()) {
  const profileNames = String(profileArg ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const matchers = [];
  for (const profileName of profileNames) {
    const profile = profiles[profileName];
    if (!profile) {
      throw new Error(`Unknown profile "${profileName}" in config/translation-phases.json`);
    }
    for (const matcher of profile.match ?? []) {
      if (!matchers.includes(matcher)) matchers.push(matcher);
    }
  }

  return matchers;
}

function priority(job) {
  const groupPriority = { ui: 0, dialog: 1, gameplay: 2, misc: 3 };
  return groupPriority[job.group] ?? 9;
}

function readTranslatedStrings(inputFile) {
  const outputFile = inputFile.replace(/^input[\\/]/, "output/");
  if (!fs.existsSync(outputFile)) return [];
  const outputXml = fs.readFileSync(outputFile, "utf8");
  return extractXmlStrings(outputXml).map((item) => item.value);
}

function findFiles(root, extension) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...findFiles(fullPath, extension));
    if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) output.push(fullPath);
  }
  return output;
}

function matches(filePath, matchers) {
  if (matchers.length === 0) return true;
  const normalized = filePath.replaceAll("\\", "/");
  return matchers.some((matcher) => normalized.includes(matcher));
}
