#!/usr/bin/env node
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadConnectionProfiles } from '../lib/connection-profiles.mjs';

const bridgeRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const profiles = loadConnectionProfiles(bridgeRoot);

const ENGINE_CREDENTIAL_MAP = {
  postgres: 'databaseUrl',
  mongo: 'mongoDbConnection',
  mysql: 'connectionUrl',
  mariadb: 'connectionUrl',
  sqlserver: 'connectionString',
  sqlite: 'filePath',
  redis: 'url',
  elasticsearch: 'nodeUrl',
  cassandra: 'connectionJson',
  neo4j: 'connectionJson',
};

const ENGINE_LABELS = {
  postgres: 'Postgres',
  mongo: 'MongoDB',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  sqlserver: 'SQL Server',
  sqlite: 'SQLite',
  redis: 'Redis',
  elasticsearch: 'Elasticsearch / OpenSearch',
  cassandra: 'Cassandra',
  neo4j: 'Neo4j',
};

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function readEnvFlag(argv) {
  const index = argv.indexOf('--env');
  if (index !== -1 && argv[index + 1]) {
    return normalizeOptionalString(argv[index + 1]);
  }
  return '';
}

function resolveEnvironmentToken(envToken) {
  if (!envToken) return '';
  return profiles.aliasToEnv[envToken] ?? envToken;
}

function resolveTargetEnvironmentName(argv) {
  const fromFlag = readEnvFlag(argv);
  const fromSession = normalizeOptionalString(process.env.DB_INVESTIGATION_TOOL_ENV);
  const token = fromFlag || fromSession || profiles.defaultEnv || '';
  return resolveEnvironmentToken(token);
}

const targetEnvironmentName = resolveTargetEnvironmentName(process.argv.slice(2));
const targetEnvironmentConfig = profiles.environments[targetEnvironmentName] ?? null;

const environmentOptions = profiles.environmentNames.map((environmentName) => {
  const environmentConfig = profiles.environments[environmentName];
  return {
    id: environmentName,
    targetEnvironment: environmentName,
    label: environmentConfig?.description ? `${environmentName} — ${environmentConfig.description}` : environmentName,
    aliases: environmentConfig?.aliases ?? [],
  };
});

const engineOptions = targetEnvironmentConfig
  ? Object.entries(ENGINE_CREDENTIAL_MAP)
      .filter(([engineName, credentialKey]) => Boolean(targetEnvironmentConfig?.[engineName]?.[credentialKey]))
      .map(([engineName, credentialKey]) => ({
        id: engineName,
        targetEngine: engineName,
        label: ENGINE_LABELS[engineName] ?? engineName,
        configuredCredentialPath: `${engineName}.${credentialKey}`,
      }))
  : [];

const out = {
  configuredPath: profiles.configuredPath,
  filePath: profiles.filePath,
  defaultEnv: profiles.defaultEnv,
  resolvedEnvironment: targetEnvironmentName || null,
  environmentOptions,
  engineOptions,
  promptHints: {
    askEnvironmentCombo: 'Ask user to choose target environment first when not explicitly provided.',
    askEngineCombo:
      'After environment is chosen, ask user to choose one engine from engineOptions. If engineOptions is empty, user must add credentials in connections.json.',
  },
};

console.log(JSON.stringify(out, null, 2));
