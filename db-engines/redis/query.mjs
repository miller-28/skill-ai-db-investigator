#!/usr/bin/env node
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from 'redis';
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
  node query.mjs --env local-dev ping
  node query.mjs --env local-dev info [section]
  node query.mjs --env local-dev dbsize
  node query.mjs --env local-dev get <key>
  node query.mjs --env local-dev hgetall <key>
  node query.mjs --env local-dev smembers <key>
  node query.mjs --env local-dev lrange <key> <start> <stop>
  node query.mjs --env local-dev zrange <key> <start> <stop>
  node query.mjs --env local-dev scan [cursor] [match] [count]`);
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
  engine: 'redis',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

const { value: redisUrl, source, envName: resolvedEnvName } = resolveEngineConnection({
  bridgeRoot,
  engine: 'redis',
  envNameFlag: envName,
});

ensureUserContextStore({ bridgeRoot, envName: resolvedEnvName, engine: 'redis' });
sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: resolvedEnvName,
  engine: 'redis',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

const client = createClient({ url: redisUrl });
const subcommand = argv[0]?.toLowerCase();

try {
  await client.connect();
  const infoServer = await client.info('server');
  const dbVersion =
    infoServer
      .split('\n')
      .find((line) => line.startsWith('redis_version:'))
      ?.split(':')[1]
      ?.trim() || 'unknown';

  const allowedCommands = new Set(['ping', 'info', 'dbsize', 'get', 'hgetall', 'smembers', 'lrange', 'zrange', 'scan']);
  if (!allowedCommands.has(subcommand)) {
    console.error(
      JSON.stringify(
        {
          source,
          connectionEnv: resolvedEnvName,
          investigationSession: sessionSubdir,
          readOnlyViolation: true,
          code: READ_ONLY_VIOLATION_CODE,
          error: `Unsupported or mutating Redis command: ${argv[0]}`,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  let result;
  if (subcommand === 'ping') {
    result = await client.ping();
  } else if (subcommand === 'info') {
    result = await client.info(argv[1]);
  } else if (subcommand === 'dbsize') {
    result = await client.dbSize();
  } else if (subcommand === 'get') {
    result = await client.get(argv[1]);
  } else if (subcommand === 'hgetall') {
    result = await client.hGetAll(argv[1]);
  } else if (subcommand === 'smembers') {
    result = await client.sMembers(argv[1]);
  } else if (subcommand === 'lrange') {
    result = await client.lRange(argv[1], Number(argv[2] ?? 0), Number(argv[3] ?? -1));
  } else if (subcommand === 'zrange') {
    result = await client.zRange(argv[1], Number(argv[2] ?? 0), Number(argv[3] ?? -1));
  } else if (subcommand === 'scan') {
    result = await client.scan(Number(argv[1] ?? 0), {
      MATCH: argv[2] || '*',
      COUNT: Number(argv[3] ?? 100),
    });
  }

  const argvLine = argv.map((argument) => (/\s/.test(argument) ? JSON.stringify(argument) : argument)).join(' ');
  recordQueryLog({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'redis',
    sessionSubdir,
    extension: 'redis.txt',
    dbVersion,
    body: `-- recordedUTC: ${new Date().toISOString()}\n-- engine: redis\n-- credentialSource: ${source}\n-- connectionEnv: ${resolvedEnvName}\n-- dbVersion: ${dbVersion}\n-- investigationSession: ${sessionSubdir}\n-- argv: node query.mjs ${argvLine}\n`,
  });

  recordDatabaseContextMetadata({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'redis',
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
} finally {
  await client.quit();
}


