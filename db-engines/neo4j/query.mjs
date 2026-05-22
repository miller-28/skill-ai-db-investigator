#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import neo4j from 'neo4j-driver';
import {
  recordQueryLog,
  resolveLogSessionSubdir,
  stripLeadingBridgeFlags,
} from '../../lib/investigation-log.mjs';
import { ensureUserContextStore } from '../../lib/context-store.mjs';
import { recordDatabaseContextMetadata } from '../../lib/database-context-metadata.mjs';
import { resolveEngineConnection } from '../../lib/connection-profiles.mjs';
import { READ_ONLY_VIOLATION_CODE } from '../../lib/postgres-read-only.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bridgeRoot = resolve(__dirname, '../..');

function resolveCypherFilePath(raw) {
  const rel = raw.startsWith('@') ? raw.slice(1) : raw;
  const candidates = [resolve(process.cwd(), rel), resolve(__dirname, rel), resolve(rel)];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  throw new Error(`Cypher file not found: ${raw}`);
}

function readCypher(argv) {
  const fileIndex = argv.indexOf('--file');
  if (fileIndex !== -1 && argv[fileIndex + 1]) return readFileSync(resolveCypherFilePath(argv[fileIndex + 1]), 'utf8').trim();
  const filtered = argv.filter((argument) => argument !== '--file');
  if (filtered.length === 1 && filtered[0].startsWith('@')) return readFileSync(resolveCypherFilePath(filtered[0]), 'utf8').trim();
  if (filtered.length > 0) return filtered.join(' ').trim();
  if (!process.stdin.isTTY) return readFileSync(0, 'utf8').trim();
  throw new Error('No Cypher provided.');
}

function assertReadOnlyCypher(cypherText) {
  const normalized = cypherText.trim().toUpperCase();
  const allowedRoots = ['MATCH', 'WITH', 'RETURN', 'CALL', 'SHOW', 'UNWIND'];
  if (!allowedRoots.some((root) => normalized.startsWith(root))) {
    throw new Error('Cypher query must start with MATCH/WITH/RETURN/CALL/SHOW/UNWIND for read-only mode.');
  }
  const bannedTokens = [' CREATE ', ' MERGE ', ' DELETE ', ' DETACH DELETE ', ' SET ', ' DROP ', ' REMOVE '];
  const padded = ` ${normalized.replace(/\s+/g, ' ')} `;
  for (const token of bannedTokens) {
    if (padded.includes(token)) {
      throw new Error(`Mutating Cypher token not allowed in read-only mode: ${token.trim()}`);
    }
  }
}

const rawArgv = process.argv.slice(2);
if (rawArgv.includes('--help') || rawArgv.includes('-h')) {
  console.error(`Usage (optional --env / --log-dir / --investigation only at the start):
  node query.mjs --env ENV_NAME --log-dir SESSION_NAME --investigation SLUG @script.cypher
  node query.mjs "MATCH (n) RETURN n LIMIT 10"  (read-only; starts with MATCH/WITH/RETURN/CALL/SHOW/UNWIND)
  node query.mjs --file script.cypher
  node query.mjs @script.cypher
  Stdin: Get-Content q.cypher | node query.mjs`);
  process.exit(0);
}
const { argv, logDir, investigation, envName } = stripLeadingBridgeFlags(rawArgv);
const requestedEnvironmentName = envName ?? process.env.DB_INVESTIGATION_TOOL_ENV ?? 'unresolved-env';
let sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: requestedEnvironmentName,
  engine: 'neo4j',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

const cypher = readCypher(argv);
if (!cypher) {
  console.error('Empty Cypher.');
  process.exit(1);
}

try {
  assertReadOnlyCypher(cypher);
} catch (error) {
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

const { value: connection, source, envName: resolvedEnvName } = resolveEngineConnection({
  bridgeRoot,
  engine: 'neo4j',
  envNameFlag: envName,
});

ensureUserContextStore({ bridgeRoot, envName: resolvedEnvName, engine: 'neo4j' });
sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: resolvedEnvName,
  engine: 'neo4j',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

let driver;
let session;
try {
  const config = JSON.parse(connection);
  driver = neo4j.driver(config.uri, neo4j.auth.basic(config.username, config.password));
  session = driver.session({ defaultAccessMode: neo4j.session.READ, database: config.database || undefined });

  const versionResult = await session.run('CALL dbms.components() YIELD versions RETURN versions[0] AS version LIMIT 1');
  const dbVersion = versionResult.records?.[0]?.get('version') || 'unknown';

  recordQueryLog({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'neo4j',
    sessionSubdir,
    extension: 'cypher',
    dbVersion,
    body: `-- recordedUTC: ${new Date().toISOString()}\n-- engine: neo4j\n-- credentialSource: ${source}\n-- connectionEnv: ${resolvedEnvName}\n-- dbVersion: ${dbVersion}\n-- investigationSession: ${sessionSubdir}\n\n${cypher}\n`,
  });

  recordDatabaseContextMetadata({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'neo4j',
    dbVersion,
    source,
    sessionSubdir,
  });

  const startedAt = Date.now();
  const queryResult = await session.run(cypher);
  const rows = queryResult.records.map((record) => record.toObject());

  console.log(
    JSON.stringify(
      {
        source,
        connectionEnv: resolvedEnvName,
        investigationSession: sessionSubdir,
        dbVersion,
        ms: Date.now() - startedAt,
        rowCount: rows.length,
        rows,
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
  if (session) await session.close();
  if (driver) await driver.close();
}


