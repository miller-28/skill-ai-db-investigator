#!/usr/bin/env node
/**
 * Entry point: print OS / shell hints and safe invocation patterns for ai-db-investigator.
 * Run from repo root: `node skill-ai-db-investigator/scripts/diagnose.mjs`
 * Or from bridge root: `node scripts/diagnose.mjs` / `npm run diagnose`
 */
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadConnectionProfiles } from '../lib/connection-profiles.mjs';

const bridgeRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const postgresDir = join(bridgeRoot, 'db-engines', 'postgres');
const mongoDir = join(bridgeRoot, 'db-engines', 'mongo');
const mysqlDir = join(bridgeRoot, 'db-engines', 'mysql');
const mariadbDir = join(bridgeRoot, 'db-engines', 'mariadb');
const sqlserverDir = join(bridgeRoot, 'db-engines', 'sqlserver');
const sqliteDir = join(bridgeRoot, 'db-engines', 'sqlite');
const redisDir = join(bridgeRoot, 'db-engines', 'redis');
const elasticsearchDir = join(bridgeRoot, 'db-engines', 'elasticsearch');
const cassandraDir = join(bridgeRoot, 'db-engines', 'cassandra');
const neo4jDir = join(bridgeRoot, 'db-engines', 'neo4j');
const platform = process.platform;
const isWindows = platform === 'win32';

const globalDbContextRoot = join(bridgeRoot, 'db-context');
const globalQueryLogRoot = join(bridgeRoot, 'investigations');
const dbContextTemplateRoot = join(bridgeRoot, 'db-context-template');
const globalDbContextExists = existsSync(globalDbContextRoot);
const globalQueryLogExists = existsSync(globalQueryLogRoot);
const dbContextTemplateExists = existsSync(dbContextTemplateRoot);
const connectionProfiles = loadConnectionProfiles(bridgeRoot);

const recommendations = [];

if (isWindows) {
  recommendations.push(
    'Postgres on Windows PowerShell: do NOT pass SQL that contains double-quoted identifiers ("MyTable") as a single double-quoted CLI argument — escaping breaks.',
  );
  recommendations.push(
    'Preferred Postgres (pick one): (1) `node query.mjs --file path.sql` (2) `node query.mjs @path.sql` — @ resolves from cwd then from postgres/ (3) pipe: `Get-Content .\\q.sql | node query.mjs` from postgres/',
  );
  recommendations.push(
    'Put ad-hoc SQL in a temp file under postgres/ (e.g. tmp-investigate.sql; tmp-*.sql is gitignored) and run with --file or @.',
  );
} else {
  recommendations.push(
    'Postgres: inline SQL is usually fine in bash/zsh; for large SQL or tricky quotes, still prefer `--file` or `@path.sql`.',
  );
  recommendations.push('Pipe: `node query.mjs < q.sql` from postgres/');
}

recommendations.push(
  'Read-only enforcement: Postgres allows only one SELECT / WITH / VALUES / TABLE / SHOW / EXPLAIN statement per run (wrapped in a READ ONLY transaction). Mongo aggregate rejects $out and $merge. If an investigation needs writes, ask the user in chat first; do not bypass this bridge.',
);

recommendations.push(
  'Investigation logs: set the same DB_INVESTIGATION_TOOL_LOG_DIR (or repeat the same --log-dir value) for every query in one investigation so files land under investigations/<env>/<engine>/<session>/. Without LOG_DIR, each run uses a new auto folder YYYY-MM-DD_HH-mm-SS_<investigation>.',
);

recommendations.push(
  'Mongo argv is short; inline is fine on Windows. For very long JSON filters, consider wrapping in a tiny script or shorten with --file if you add that pattern later.',
);
recommendations.push(
  'Context store model: db-context-template/<engine>/ is the committed template; db-context/<env>/<engine>/ is runtime context (gitignored). query.mjs auto-seeds missing runtime files from template.',
);
recommendations.push(
  'DB version telemetry: each successful query writes dbVersion into query logs, session report, and db-context/<env>/<engine>/database-profile.md.',
);
recommendations.push(
  'Cross-platform ergonomics: run `npm run shell-help` to print copy-paste command recipes for bash/zsh, fish, PowerShell, and cmd across all supported engines.',
);
recommendations.push(
  'Connection environments: define named environments in connections.json and choose one with --env (per command) or DB_INVESTIGATION_TOOL_ENV (per shell session).',
);
if (connectionProfiles.environmentNames.length > 1 && !connectionProfiles.defaultEnv) {
  recommendations.push(
    `Multiple named environments are configured (${connectionProfiles.environmentNames.join(', ')}); choose one explicitly with --env or DB_INVESTIGATION_TOOL_ENV.`,
  );
}
if (!connectionProfiles.hasConfiguredFile) {
  recommendations.push('connections.json is missing. Copy connections.example.json and add real credentials.');
}

const shellHint = isWindows
  ? { comSpec: process.env.ComSpec ?? null, powershell: Boolean(process.env.PSModulePath) }
  : { shell: process.env.SHELL ?? null };

const shellCommands = {
  bash_zsh: {
    setEnv: 'export DB_INVESTIGATION_TOOL_ENV=local-dev',
    setSession: 'export DB_INVESTIGATION_TOOL_LOG_DIR=2026-05-19_14-00-00_audit',
    postgresQueryFile: `cd "${postgresDir}" && node query.mjs --env local-dev --file ./tmp-audit.sql`,
    postgresPipe: `cd "${postgresDir}" && cat ./tmp-audit.sql | node query.mjs --env local-dev`,
    mongoListDbs: `cd "${mongoDir}" && node query.mjs --env local-dev listDbs`,
  },
  fish: {
    setEnv: 'set -x DB_INVESTIGATION_TOOL_ENV local-dev',
    setSession: 'set -x DB_INVESTIGATION_TOOL_LOG_DIR 2026-05-19_14-00-00_audit',
    postgresQueryFile: `cd "${postgresDir}"; node query.mjs --env local-dev --file ./tmp-audit.sql`,
    mongoListDbs: `cd "${mongoDir}"; node query.mjs --env local-dev listDbs`,
  },
  powershell: {
    setEnv: "$env:DB_INVESTIGATION_TOOL_ENV='local-dev'",
    setSession: "$env:DB_INVESTIGATION_TOOL_LOG_DIR='2026-05-19_14-00-00_audit'",
    postgresQueryFile: `cd "${postgresDir}"; node query.mjs --env local-dev --file .\\tmp-audit.sql`,
    postgresPipe: `cd "${postgresDir}"; Get-Content .\\tmp-audit.sql | node query.mjs --env local-dev`,
    mongoListDbs: `cd "${mongoDir}"; node query.mjs --env local-dev listDbs`,
  },
  cmd: {
    setEnv: 'set DB_INVESTIGATION_TOOL_ENV=local-dev',
    setSession: 'set DB_INVESTIGATION_TOOL_LOG_DIR=2026-05-19_14-00-00_audit',
    postgresQueryFile: `cd /d "${postgresDir}" && node query.mjs --env local-dev --file .\\tmp-audit.sql`,
    mongoListDbs: `cd /d "${mongoDir}" && node query.mjs --env local-dev listDbs`,
  },
};

const out = {
  bridgeRoot,
  platform,
  isWindows,
  shellHint,
  postgresDir,
  mongoDir,
  mysqlDir,
  mariadbDir,
  sqlserverDir,
  sqliteDir,
  redisDir,
  elasticsearchDir,
  cassandraDir,
  neo4jDir,
  globalDbContextRoot,
  globalDbContextExists,
  globalQueryLogRoot,
  globalQueryLogExists,
  dbContextTemplateRoot,
  dbContextTemplateExists,
  connectionProfiles: {
    configuredPath: connectionProfiles.configuredPath,
    filePath: connectionProfiles.filePath,
    exists: connectionProfiles.exists,
    hasConfiguredFile: connectionProfiles.hasConfiguredFile,
    defaultEnv: connectionProfiles.defaultEnv,
    environmentNames: connectionProfiles.environmentNames,
    aliasesByEnvironment: Object.fromEntries(
      connectionProfiles.environmentNames.map((name) => [name, connectionProfiles.environments[name]?.aliases ?? []]),
    ),
  },
  postgresCommands: {
    diagnoseThenQuery: `cd "${postgresDir}" && node query.mjs --env your-env --file your.sql`,
    atFileShorthand: `cd "${postgresDir}" && node query.mjs --env your-env @your.sql`,
    powershellPipe: `cd "${postgresDir}"; $env:DB_INVESTIGATION_TOOL_ENV='your-env'; Get-Content .\\your.sql | node query.mjs`,
    multiQuerySessionPowerShell: `cd "${postgresDir}"; $env:DB_INVESTIGATION_TOOL_ENV='your-env'; $env:DB_INVESTIGATION_TOOL_LOG_DIR='2026-05-12_15-30-00_my-audit'; node query.mjs @q1.sql; node query.mjs @q2.sql`,
  },
  mongoCommands: {
    listDbs: `cd "${mongoDir}" && node query.mjs --env your-env listDbs`,
  },
  mysqlCommands: {
    queryFile: `cd "${mysqlDir}" && node query.mjs --env your-env --file your.sql`,
  },
  mariadbCommands: {
    queryFile: `cd "${mariadbDir}" && node query.mjs --env your-env --file your.sql`,
  },
  sqlserverCommands: {
    queryFile: `cd "${sqlserverDir}" && node query.mjs --env your-env --file your.sql`,
  },
  sqliteCommands: {
    queryFile: `cd "${sqliteDir}" && node query.mjs --env your-env --file your.sql`,
  },
  redisCommands: {
    info: `cd "${redisDir}" && node query.mjs --env your-env info server`,
  },
  elasticsearchCommands: {
    info: `cd "${elasticsearchDir}" && node query.mjs --env your-env info`,
  },
  cassandraCommands: {
    queryFile: `cd "${cassandraDir}" && node query.mjs --env your-env --file your.cql`,
  },
  neo4jCommands: {
    queryFile: `cd "${neo4jDir}" && node query.mjs --env your-env --file your.cypher`,
  },
  shellCommands,
  recommendations,
};

console.log(JSON.stringify(out, null, 2));
console.error('\n--- human summary ---\n');
console.error(`OS: ${platform}${isWindows ? ' (use --file or @ for Postgres identifiers)' : ''}`);
console.error(
  `connections.json: ${connectionProfiles.hasConfiguredFile ? 'present' : 'missing (copy connections.example.json)'}${connectionProfiles.defaultEnv ? `; defaultEnv=${connectionProfiles.defaultEnv}` : ''}`,
);
if (connectionProfiles.environmentNames.length) {
  console.error(`connection envs: ${connectionProfiles.environmentNames.join(', ')}`);
  for (const name of connectionProfiles.environmentNames) {
    const aliases = connectionProfiles.environments[name]?.aliases ?? [];
    if (aliases.length) console.error(`aliases for ${name}: ${aliases.join(', ')}`);
  }
}
console.error(`db-context root: ${globalDbContextExists ? 'present' : 'missing (auto-created by query.mjs)'}`);
console.error(`investigations root: ${globalQueryLogExists ? 'present' : 'missing (auto-created by query.mjs)'}`);
console.error(`db-context-template root: ${dbContextTemplateExists ? 'present' : 'missing (committed templates expected)'}`);
for (const line of recommendations) console.error(`• ${line}`);
