#!/usr/bin/env node
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@elastic/elasticsearch';
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

function help() {
  console.error(`Usage:
  node query.mjs --env local-dev info
  node query.mjs --env local-dev catIndices
  node query.mjs --env local-dev search <index> '<queryJson>'
  node query.mjs --env local-dev count <index> '<queryJson>'`);
}

const rawArgv = process.argv.slice(2);
if (rawArgv.length === 0 || rawArgv.includes('--help') || rawArgv.includes('-h')) {
  help();
  process.exit(rawArgv.length === 0 ? 1 : 0);
}

const { argv, logDir, investigation, envName } = stripLeadingBridgeFlags(rawArgv);
const requestedEnvironmentName = envName ?? process.env.DB_INVESTIGATION_TOOL_ENV ?? 'unresolved-env';
let sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: requestedEnvironmentName,
  engine: 'elasticsearch',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

const { value: nodeUrl, source, envName: resolvedEnvName } = resolveEngineConnection({
  bridgeRoot,
  engine: 'elasticsearch',
  envNameFlag: envName,
});

ensureUserContextStore({ bridgeRoot, envName: resolvedEnvName, engine: 'elasticsearch' });
sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: resolvedEnvName,
  engine: 'elasticsearch',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

const client = new Client({ node: nodeUrl });
const command = argv[0];
const allowed = new Set(['info', 'catIndices', 'search', 'count']);
if (!allowed.has(command)) {
  console.error(
    JSON.stringify(
      {
        source,
        connectionEnv: resolvedEnvName,
        investigationSession: sessionSubdir,
        readOnlyViolation: true,
        code: READ_ONLY_VIOLATION_CODE,
        error: `Unsupported or mutating command: ${command}`,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

try {
  const info = await client.info();
  const dbVersion = info.version?.number || 'unknown';

  let result;
  if (command === 'info') {
    result = info;
  } else if (command === 'catIndices') {
    result = await client.cat.indices({ format: 'json' });
  } else if (command === 'search') {
    const index = argv[1];
    const query = argv[2] ? JSON.parse(argv[2]) : { query: { match_all: {} } };
    result = await client.search({ index, ...query });
  } else if (command === 'count') {
    const index = argv[1];
    const query = argv[2] ? JSON.parse(argv[2]) : { query: { match_all: {} } };
    result = await client.count({ index, ...query });
  }

  const argvLine = argv.map((argument) => (/\s/.test(argument) ? JSON.stringify(argument) : argument)).join(' ');
  recordQueryLog({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'elasticsearch',
    sessionSubdir,
    extension: 'es.txt',
    dbVersion,
    body: `-- recordedUTC: ${new Date().toISOString()}\n-- engine: elasticsearch/opensearch\n-- credentialSource: ${source}\n-- connectionEnv: ${resolvedEnvName}\n-- dbVersion: ${dbVersion}\n-- investigationSession: ${sessionSubdir}\n-- argv: node query.mjs ${argvLine}\n`,
  });

  recordDatabaseContextMetadata({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'elasticsearch',
    dbVersion,
    source,
    sessionSubdir,
  });

  console.log(
    JSON.stringify(
      {
        source,
        connectionEnv: resolvedEnvName,
        investigationSession: sessionSubdir,
        dbVersion,
        result,
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
}


