#!/usr/bin/env node
/**
 * Run one SQL statement against Postgres via a named environment from `../../connections.json`.
 *
 * Usage (optional leading flags only at the start):
 *   node query.mjs --env local-dev --log-dir 2026-05-12_15-30-00_sync-audit --investigation sync-audit @q.sql
 *   node query.mjs "SELECT 1 AS ok"
 *   node query.mjs --file path.sql
 *   node query.mjs @path.sql
 *   Get-Content .\q.sql | node query.mjs
 *
 * Investigation logs: under ../../investigations/<env>/<engine>/<session>/ where session is from
 * DB_INVESTIGATION_TOOL_LOG_DIR or --log-dir, else auto YYYY-MM-DD_HH-mm-SS_<investigation>.
 * Reuse the same --log-dir / env for multiple queries in one investigation.
 *
 * Env:
 *   DB_INVESTIGATION_TOOL_ENV -- optional session-level environment name from connections.json.
 *   DB_INVESTIGATION_TOOL_CONNECTIONS_FILE -- optional custom path to connections.json.
 *   DB_INVESTIGATION_TOOL_LOG_DIR -- full session folder name (same for every query in one investigation).
 *   DB_INVESTIGATION_TOOL_INVESTIGATION -- short slug for auto-generated session folder when LOG_DIR unset.
 *   DB_INVESTIGATION_TOOL_NO_QUERY_LOG -- set to `1` to skip writing ../../investigations/<env>/<engine>/ audit files.
 *
 * Read-only: only one statement per invocation; must start as SELECT, WITH, VALUES, TABLE, SHOW, or EXPLAIN
 * (over a read-only statement). Runs inside a READ ONLY transaction. INSERT/UPDATE/DELETE/DDL are rejected
 * before execution -- if an investigation needs writes, the agent must ask the user for permission in chat
 * and use a different client.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import {
  recordQueryLog,
  resolveLogSessionSubdir,
  stripLeadingBridgeFlags,
} from '../../lib/investigation-log.mjs';
import { ensureUserContextStore } from '../../lib/context-store.mjs';
import { recordDatabaseContextMetadata } from '../../lib/database-context-metadata.mjs';
import { resolveEngineConnection } from '../../lib/connection-profiles.mjs';
import {
  READ_ONLY_VIOLATION_CODE,
  ReadOnlySqlViolation,
  assertReadOnlyPostgresSql,
} from '../../lib/postgres-read-only.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bridgeRoot = resolve(__dirname, '../..');

function resolveSqlFilePath(raw) {
  const rel = raw.startsWith('@') ? raw.slice(1) : raw;
  const candidates = [resolve(process.cwd(), rel), resolve(__dirname, rel), resolve(rel)];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`SQL file not found: ${raw} (tried cwd, postgres/, and absolute)`);
}

function readSql(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.error(`Usage (optional --env / --log-dir / --investigation only at the start):
  node query.mjs --env ENV_NAME --log-dir SESSION_NAME --investigation SLUG @script.sql
  node query.mjs "SELECT ..."  (read-only: SELECT / WITH / VALUES / TABLE / SHOW / EXPLAIN only; one statement)
  node query.mjs --file script.sql
  node query.mjs @script.sql
  Stdin: Get-Content q.sql | node query.mjs`);
    process.exit(0);
  }
  const fi = argv.indexOf('--file');
  if (fi !== -1 && argv[fi + 1]) {
    return readFileSync(resolveSqlFilePath(argv[fi + 1]), 'utf8').trim();
  }
  const rest = argv.filter((a) => a !== '--file');
  if (rest.length === 1 && rest[0].startsWith('@')) {
    return readFileSync(resolveSqlFilePath(rest[0]), 'utf8').trim();
  }
  if (rest.length > 0) return rest.join(' ').trim();
  if (!process.stdin.isTTY) {
    return readFileSync(0, 'utf8').trim();
  }
  throw new Error('No SQL: pass a query string, --file path, @path.sql, or pipe SQL on stdin.');
}

const rawArgv = process.argv.slice(2);
if (rawArgv.includes('--help') || rawArgv.includes('-h')) {
  readSql(['--help']);
}
const { argv, logDir, investigation, envName } = stripLeadingBridgeFlags(rawArgv);

const requestedEnvironmentName = envName ?? process.env.DB_INVESTIGATION_TOOL_ENV ?? 'unresolved-env';
let sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: requestedEnvironmentName,
  engine: 'postgres',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

const sql = readSql(argv);
if (!sql) {
  console.error('Empty SQL.');
  process.exit(1);
}

try {
  assertReadOnlyPostgresSql(sql);
} catch (e) {
  if (e instanceof ReadOnlySqlViolation) {
    console.error(
      JSON.stringify(
        {
          source: 'connection:unresolved',
          connectionEnv: envName ?? process.env.DB_INVESTIGATION_TOOL_ENV ?? null,
          investigationSession: sessionSubdir,
          readOnlyViolation: true,
          error: e.message,
          code: READ_ONLY_VIOLATION_CODE,
          agentHint:
            'This bridge is read-only. If the user explicitly approves a mutating query, do not use this CLI -- use psql or another approved client.',
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  throw e;
}

const { value: connectionString, source, envName: resolvedEnvName } = resolveEngineConnection({
  bridgeRoot,
  engine: 'postgres',
  envNameFlag: envName,
});

ensureUserContextStore({ bridgeRoot, envName: resolvedEnvName, engine: 'postgres' });
sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: resolvedEnvName,
  engine: 'postgres',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

const pool = new pg.Pool({ connectionString, max: 1 });
let client;
try {
  client = await pool.connect();
  const versionResult = await client.query('SHOW server_version');
  const dbVersion = versionResult.rows?.[0]?.server_version || 'unknown';

  const logBodyWithVersion = `-- recordedUTC: ${new Date().toISOString()}
-- engine: postgres
-- credentialSource: ${source}
-- connectionEnv: ${resolvedEnvName}
-- dbVersion: ${dbVersion}
-- investigationSession: ${sessionSubdir}

${sql}
`;
  recordQueryLog({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'postgres',
    sessionSubdir,
    extension: 'sql',
    body: logBodyWithVersion,
    dbVersion,
  });
  recordDatabaseContextMetadata({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'postgres',
    dbVersion,
    source,
    sessionSubdir,
  });

  const start = Date.now();
  await client.query('BEGIN READ ONLY');
  const result = await client.query(sql);
  await client.query('COMMIT');
  const out = {
    source,
    connectionEnv: resolvedEnvName ?? null,
    investigationSession: sessionSubdir,
    dbVersion,
    ms: Date.now() - start,
    command: result.command,
    rowCount: result.rowCount,
    rows: result.rows,
  };
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  if (client) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
  }
  const readOnlyDb =
    e?.code === '25006' || /read-only transaction/i.test(String(e?.message || ''));
  console.error(
    JSON.stringify(
      {
        source,
        connectionEnv: resolvedEnvName ?? null,
        investigationSession: sessionSubdir,
        error: e.message,
        code: e.code,
        ...(readOnlyDb
          ? {
              readOnlyViolation: true,
              agentHint:
                'The server rejected this as a write or lock inside a READ ONLY transaction. Ask the user before trying a different execution path.',
            }
          : {}),
      },
      null,
      2,
    ),
  );
  process.exit(1);
} finally {
  if (client) client.release();
  await pool.end();
}


