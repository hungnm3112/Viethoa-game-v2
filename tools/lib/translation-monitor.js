import fs from "node:fs";
import path from "node:path";
import { readJson } from "./json-store.js";
import { extractXmlStrings, normalizeText } from "./strings.js";
import { appendCollectionLog, readRecentCollectionLogs, readStateJson, writeStateJson } from "./state-repository.js";

export const REPORT_DIR = "output/reports";
export const DASHBOARD_FILE = `${REPORT_DIR}/translation-dashboard.json`;
export const SESSION_FILE = `${REPORT_DIR}/translation-session.json`;
export const EVENT_FILE = `${REPORT_DIR}/translation-events.ndjson`;
export const ROLLBACK_DIR = "output/rollback";

export function createSession(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? `session-${now.replace(/[:.]/g, "-")}`,
    status: partial.status ?? "idle",
    scope: partial.scope ?? "all",
    startedAt: partial.startedAt ?? now,
    updatedAt: now,
    completedAt: partial.completedAt ?? null,
    lastError: partial.lastError ?? null,
    activeModel: partial.activeModel ?? null,
    processedJobs: partial.processedJobs ?? 0,
    successfulJobs: partial.successfulJobs ?? 0,
    failedJobs: partial.failedJobs ?? 0,
    skippedJobs: partial.skippedJobs ?? 0,
    translatedStrings: partial.translatedStrings ?? 0,
    reusedCachedStrings: partial.reusedCachedStrings ?? 0,
    fallbackCount: partial.fallbackCount ?? 0,
    rollbackCount: partial.rollbackCount ?? 0,
    notes: partial.notes ?? [],
  };
}

export async function saveSession(session) {
  session.updatedAt = new Date().toISOString();
  await writeStateJson("translation.session", SESSION_FILE, session);
}

export async function loadSession() {
  return readStateJson("translation.session", SESSION_FILE, createSession());
}

export async function appendEvent(type, details = {}) {
  const line = {
    at: new Date().toISOString(),
    type,
    ...details,
  };
  await appendCollectionLog(EVENT_FILE, "translation_events", line);
}

export async function updateDashboard(options = {}) {
  const { scope = "all", notes = [] } = options;
  const session = options.session ?? (await loadSession());
  const jobs = {
    pending: await readStateJson("jobs.pending", "jobs/pending.json", []),
    done: await readStateJson("jobs.done", "jobs/done.json", []),
    failed: await readStateJson("jobs.failed", "jobs/failed.json", []),
  };

  const files = collectFileCoverage(scope);
  const totals = files.reduce(
    (acc, file) => {
      acc.total += file.total;
      acc.translated += file.translated;
      return acc;
    },
    { total: 0, translated: 0 },
  );

  const recentEvents = await readRecentEvents(50);
  const dashboard = {
    generatedAt: new Date().toISOString(),
    session,
    queue: {
      pendingJobs: jobs.pending.length,
      doneJobs: jobs.done.length,
      failedJobs: jobs.failed.length,
    },
    coverage: {
      totalStrings: totals.total,
      translatedStrings: totals.translated,
      percent: totals.total === 0 ? 0 : Number(((totals.translated / totals.total) * 100).toFixed(2)),
    },
    files,
    recentEvents,
    notes,
  };

  await writeStateJson("translation.dashboard", DASHBOARD_FILE, dashboard);
  return dashboard;
}

export function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const relativePath = filePath.replaceAll("\\", "/").replace(/^output\//, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(ROLLBACK_DIR, `${relativePath}.${stamp}.bak`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(filePath, backupPath);
  return backupPath.replaceAll("\\", "/");
}

export function restoreBackup(filePath, backupPath) {
  if (!backupPath || !fs.existsSync(backupPath)) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.copyFileSync(backupPath, filePath);
  return true;
}

export function latestBackups() {
  const files = walkFiles(ROLLBACK_DIR, ".bak");
  const latest = new Map();
  for (const file of files) {
    const normalized = file.replaceAll("\\", "/");
    const key = normalized
      .replace(/^output\/rollback\//, "")
      .replace(/\.\d{4}-\d{2}-\d{2}T.*\.bak$/, "");
    const current = latest.get(key);
    if (!current || normalized > current) latest.set(key, normalized);
  }
  return [...latest.entries()].map(([target, backup]) => ({ target, backup }));
}

function collectFileCoverage(scope) {
  const matchers = resolveScopeMatchers(scope);
  const files = walkFiles("input", ".xml").filter((file) => matches(file, matchers));
  const rows = [];

  for (const inputFile of files) {
    const outputFile = inputFile.replace(/^input[\\/]/, "output/");
    const sourceStrings = loadStrings(inputFile);
    const translatedStrings = fs.existsSync(outputFile) ? loadStrings(outputFile) : [];
    let translated = 0;

    for (let index = 0; index < Math.min(sourceStrings.length, translatedStrings.length); index += 1) {
      if (normalizeText(sourceStrings[index]) !== normalizeText(translatedStrings[index])) {
        translated += 1;
      }
    }

    rows.push({
      file: inputFile.replaceAll("\\", "/"),
      outputFile: outputFile.replaceAll("\\", "/"),
      total: sourceStrings.length,
      translated,
      percent: sourceStrings.length === 0 ? 0 : Number(((translated / sourceStrings.length) * 100).toFixed(2)),
    });
  }

  return rows.sort((a, b) => a.file.localeCompare(b.file));
}

function loadStrings(filePath) {
  const xml = fs.readFileSync(filePath, "utf8");
  return extractXmlStrings(xml).map((item) => item.value);
}

async function readRecentEvents(limit) {
  return readRecentCollectionLogs(EVENT_FILE, "translation_events", limit);
}

function resolveScopeMatchers(scope) {
  if (!scope || scope === "all") return [];
  const profiles = readJson("config/translation-phases.json", {});
  const names = String(scope)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const matchers = [];
  for (const name of names) {
    const normalizedName = name.replace(/^profile:/, "");
    const profile = profiles[normalizedName];
    if (profile) {
      for (const matcher of profile.match ?? []) {
        if (!matchers.includes(matcher)) matchers.push(matcher);
      }
      continue;
    }
    if (!matchers.includes(normalizedName)) matchers.push(normalizedName);
  }
  return matchers;
}

function matches(filePath, matchers) {
  if (matchers.length === 0) return true;
  const normalized = filePath.replaceAll("\\", "/");
  return matchers.some((matcher) => normalized.includes(matcher));
}

function walkFiles(root, extension) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...walkFiles(fullPath, extension));
    if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) output.push(fullPath);
  }
  return output;
}
