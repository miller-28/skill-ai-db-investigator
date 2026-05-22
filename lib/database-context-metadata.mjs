import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const MAX_SEGMENT = 120;
const MAX_HISTORY_SESSIONS = 50;

function sanitizePathSegment(raw, fallback) {
  let s = String(raw || fallback)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .replace(/^-+|-+$/g, '');
  if (!s) s = fallback;
  return s.slice(0, MAX_SEGMENT);
}

function buildContextDir({ bridgeRoot, envName, engine }) {
  return join(
    bridgeRoot,
    'db-context',
    sanitizePathSegment(envName, 'unresolved-env'),
    sanitizePathSegment(engine, 'unknown-engine'),
  );
}

function parseHistoryEntries(markdownText) {
  const entries = [];
  const regex = /^-\s+([^|]+?)\s+\|\s+([^|]+?)\s+\|\s+session\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(markdownText)) !== null) {
    entries.push({
      observedAtUtc: String(match[1] || '').trim(),
      dbVersion: String(match[2] || '').trim(),
      sessionSubdir: String(match[3] || '').trim(),
    });
  }
  return entries;
}

function retainLatestSessions(historyEntries) {
  const keptNewestFirst = [];
  const seenSessions = new Set();

  for (let index = historyEntries.length - 1; index >= 0; index -= 1) {
    const entry = historyEntries[index];
    if (!entry.sessionSubdir || seenSessions.has(entry.sessionSubdir)) continue;
    seenSessions.add(entry.sessionSubdir);
    keptNewestFirst.push(entry);
    if (keptNewestFirst.length >= MAX_HISTORY_SESSIONS) break;
  }

  return keptNewestFirst.reverse();
}

/**
 * Writes runtime DB metadata for the selected env + engine.
 */
export function recordDatabaseContextMetadata({ bridgeRoot, envName, engine, dbVersion, source, sessionSubdir }) {
  const contextDir = buildContextDir({ bridgeRoot, envName, engine });
  mkdirSync(contextDir, { recursive: true });

  const profilePath = join(contextDir, 'database-profile.md');
  const nowIsoUtc = new Date().toISOString();
  const currentEntry = {
    observedAtUtc: nowIsoUtc,
    dbVersion,
    sessionSubdir,
  };

  let historyEntries = [currentEntry];
  if (existsSync(profilePath)) {
    const existing = readFileSync(profilePath, 'utf8');
    historyEntries = parseHistoryEntries(existing);
    historyEntries.push(currentEntry);
  }

  const retainedHistoryEntries = retainLatestSessions(historyEntries);
  const historyLines = retainedHistoryEntries.map(
    (entry) => `- ${entry.observedAtUtc} | ${entry.dbVersion} | session ${entry.sessionSubdir}`,
  );

  const profileBody = `# Database Profile\n\n- Environment: ${envName}\n- Engine: ${engine}\n- Credential source: ${source}\n- Last observed DB version: ${dbVersion}\n- Last observed UTC: ${nowIsoUtc}\n- Last observed session: ${sessionSubdir}\n\n## Version history\n\n${historyLines.join('\n')}\n`;
  writeFileSync(profilePath, profileBody, 'utf8');
}
