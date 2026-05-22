#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import mssql from 'mssql';
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
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  throw new Error(`SQL file not found: ${raw}`);
}

function readSql(argv) {
  const fileIndex = argv.indexOf('--file');
  if (fileIndex !== -1 && argv[fileIndex + 1]) return readFileSync(resolveSqlFilePath(argv[fileIndex + 1]), 'utf8').trim();
  const filtered = argv.filter((argument) => argument !== '--file');
  if (filtered.length === 1 && filtered[0].startsWith('@')) return readFileSync(resolveSqlFilePath(filtered[0]), 'utf8').trim();
  if (filtered.length > 0) return filtered.join(' ').trim();
  if (!process.stdin.isTTY) return readFileSync(0, 'utf8').trim();
  throw new Error('No SQL provided.');
}

const rawArgv = process.argv.slice(2);
if (rawArgv.includes('--help') || rawArgv.includes('-h')) {
  console.error(`Usage (optional --env / --log-dir / --investigation only at the start):
  node query.mjs --env ENV_NAME --log-dir SESSION_NAME --investigation SLUG @script.sql
  node query.mjs "SELECT ..."  (read-only: SELECT / WITH / VALUES / TABLE / SHOW / EXPLAIN only; one statement)
  node query.mjs --file script.sql
  node query.mjs @script.sql
  Stdin: Get-Content q.sql | node query.mjs`);
  process.exit(0);
}
const { argv, logDir, investigation, envName } = stripLeadingBridgeFlags(rawArgv);
const requestedEnvironmentName = envName ?? process.env.DB_INVESTIGATION_TOOL_ENV ?? 'unresolved-env';
let sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: requestedEnvironmentName,
  engine: 'sqlserver',
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
} catch (error) {
  if (error instanceof ReadOnlySqlViolation) {
    console.error(
      JSON.stringify(
        {
          source: 'connection:unresolved',
          connectionEnv: requestedEnvironmentName,
          investigationSession: sessionSubdir,
          readOnlyViolation: true,
          error: error.message,
          code: READ_ONLY_VIOLATION_CODE,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  throw error;
}

const { value: connectionString, source, envName: resolvedEnvName } = resolveEngineConnection({
  bridgeRoot,
  engine: 'sqlserver',
  envNameFlag: envName,
});

ensureUserContextStore({ bridgeRoot, envName: resolvedEnvName, engine: 'sqlserver' });
sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: resolvedEnvName,
  engine: 'sqlserver',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

let pool;
try {
  pool = await mssql.connect(connectionString);
  const versionResult = await pool.request().query('SELECT @@VERSION AS version');
  const dbVersion = versionResult.recordset?.[0]?.version || 'unknown';

  recordQueryLog({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'sqlserver',
    sessionSubdir,
    extension: 'sql',
    dbVersion,
    body: `-- recordedUTC: ${new Date().toISOString()}\n-- engine: sqlserver\n-- credentialSource: ${source}\n-- connectionEnv: ${resolvedEnvName}\n-- dbVersion: ${dbVersion}\n-- investigationSession: ${sessionSubdir}\n\n${sql}\n`,
  });

  recordDatabaseContextMetadata({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'sqlserver',
    dbVersion,
    source,
    sessionSubdir,
  });

  const startedAt = Date.now();
  const result = await pool.request().query(sql);
  console.log(
    JSON.stringify(
      {
        source,
        connectionEnv: resolvedEnvName,
        investigationSession: sessionSubdir,
        dbVersion,
        ms: Date.now() - startedAt,
        rowCount: result.recordset?.length ?? 0,
        rows: result.recordset ?? [],
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        source,
        connectionEnv: resolvedEnvName,
        investigationSession: sessionSubdir,
        error: error.message,
        code: error.code,
      },
      null,
      2,
    ),
  );
  process.exit(1);
} finally {
  if (pool) await pool.close();
}


