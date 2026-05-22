import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Strips optional leading flags (only at the start of argv).
 * Postgres: `node query.mjs --env local-dev --log-dir NAME --investigation SLUG @q.sql`
 * Mongo: `node query.mjs --env local-dev --log-dir NAME listDbs`
 */
export function stripLeadingBridgeFlags(argv) {
  const a = [...argv];
  const flags = { logDir: undefined, investigation: undefined, envName: undefined };
  while (a.length >= 2 && typeof a[0] === 'string' && a[0].startsWith('--')) {
    if (a[0] === '--log-dir') {
      flags.logDir = a[1];
      a.splice(0, 2);
    } else if (a[0] === '--investigation') {
      flags.investigation = a[1];
      a.splice(0, 2);
    } else if (a[0] === '--env') {
      flags.envName = a[1];
      a.splice(0, 2);
    } else {
      break;
    }
  }
  return { argv: a, logDir: flags.logDir, investigation: flags.investigation, envName: flags.envName };
}

const MAX_SEGMENT = 120;

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

export function sanitizeInvestigationFolderName(raw) {
  return sanitizePathSegment(raw, 'ad-hoc');
}

/**
 * Resolves the subdirectory name under:
 * `<bridgeRoot>/investigations/<envName>/<engine>/`
 * - DB_INVESTIGATION_TOOL_LOG_DIR or --log-dir: use that exact session name (sanitized). Reuses existing dir if already present.
 * - Else: YYYY-MM-DD-HHmm_<investigation> from env/flag/default (UTC).
 */
export function resolveLogSessionSubdir({ bridgeRoot, envName, engine, logDirFlag, investigationFlag }) {
  const envLog = process.env.DB_INVESTIGATION_TOOL_LOG_DIR?.trim();
  const envInv = process.env.DB_INVESTIGATION_TOOL_INVESTIGATION?.trim();
  const logDir = (logDirFlag || envLog || '').trim();
  const investigation = investigationFlag || envInv || 'ad-hoc';

  const parent = join(
    bridgeRoot,
    'investigations',
    sanitizePathSegment(envName, 'unresolved-env'),
    sanitizePathSegment(engine, 'unknown-engine'),
  );
  mkdirSync(parent, { recursive: true });

  let candidate;
  if (logDir) {
    candidate = sanitizeInvestigationFolderName(logDir);
  } else {
    const d = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const y = d.getUTCFullYear();
    const mo = pad(d.getUTCMonth() + 1);
    const day = pad(d.getUTCDate());
    const h = pad(d.getUTCHours());
    const mi = pad(d.getUTCMinutes());
    const stamp = `${y}-${mo}-${day}-${h}${mi}`;
    candidate = `${stamp}_${sanitizeInvestigationFolderName(investigation)}`;
  }

  return pickOrReuseSessionDir(parent, candidate);
}

function pickOrReuseSessionDir(parent, name) {
  const full = join(parent, name);
  if (!existsSync(full)) return name;
  try {
    if (statSync(full).isDirectory()) return name;
  } catch {
    // fall through
  }
  let i = 2;
  let alt = `${name}_${i}`;
  while (existsSync(join(parent, alt))) {
    i += 1;
    alt = `${name}_${i}`;
    if (i > 9999) throw new Error('Could not allocate unique log session directory');
  }
  return alt;
}

function ensureSessionReport(logDir, { envName, engine, sessionSubdir, dbVersion }) {
  const reportPath = join(logDir, 'investigation-report.md');
  const nowIsoUtc = new Date().toISOString();

  if (!existsSync(reportPath)) {
    const reportBody = `# Investigation Report\n\n- Environment: ${envName}\n- Engine: ${engine}\n- Session: ${sessionSubdir}\n- Created UTC: ${nowIsoUtc}\n- Last observed DB version: ${dbVersion || 'unknown'}\n\n## Question and scope\n\n## Evidence\n\n- Query-observed facts only. Include query filenames or short query references when useful.\n\n## Interpretation\n\n- Explain what the evidence most likely means. Do not introduce unsupported facts here.\n\n## Not proven\n\n- List plausible causes, missing checks, or assumptions that were not verified.\n\n## Recommended next actions\n`;
    writeFileSync(reportPath, reportBody, 'utf8');
    return;
  }

  if (!dbVersion) return;

  const current = readFileSync(reportPath, 'utf8');
  const lines = current.split(/\r?\n/);
  const prefix = '- Last observed DB version: ';
  const target = `${prefix}${dbVersion}`;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index === -1) {
    const createdLineIndex = lines.findIndex((line) => line.startsWith('- Created UTC: '));
    if (createdLineIndex >= 0) {
      lines.splice(createdLineIndex + 1, 0, target);
    } else {
      lines.splice(1, 0, target);
    }
  } else {
    lines[index] = target;
  }
  writeFileSync(reportPath, `${lines.join('\n').replace(/\n+$/g, '')}\n`, 'utf8');
}

/**
 * Writes query/command under:
 * `<bridgeRoot>/investigations/<envName>/<engine>/<sessionDir>/`
 * and ensures a session-level `investigation-report.md` exists.
 */
export function recordQueryLog({ bridgeRoot, envName, engine, sessionSubdir, extension, body, dbVersion }) {
  if (process.env.DB_INVESTIGATION_TOOL_NO_QUERY_LOG === '1') return;

  const logDir = join(
    bridgeRoot,
    'investigations',
    sanitizePathSegment(envName, 'unresolved-env'),
    sanitizePathSegment(engine, 'unknown-engine'),
    sessionSubdir,
  );
  mkdirSync(logDir, { recursive: true });
  ensureSessionReport(logDir, { envName, engine, sessionSubdir, dbVersion });

  const d = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const ms = pad(d.getUTCMilliseconds(), 3);
  const fname = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}-${ms}Z.${extension}`;

  const path = join(logDir, fname);
  writeFileSync(path, typeof body === 'string' ? body : String(body), 'utf8');
}
