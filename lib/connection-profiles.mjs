import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const DEFAULT_CONNECTIONS_FILE = 'connections.json';

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

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function assertObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }
}

function normalizeAliases(value, envName, filePath) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Expected environment "${envName}" aliases in ${filePath} to be an array of strings.`);
  }
  return [...new Set(value.map((alias) => normalizeOptionalString(alias)).filter(Boolean))];
}

function resolveConnectionsFilePath(bridgeRoot) {
  const configured = normalizeOptionalString(process.env.DB_INVESTIGATION_TOOL_CONNECTIONS_FILE);
  if (configured) {
    return resolve(process.cwd(), configured);
  }
  return resolve(bridgeRoot, DEFAULT_CONNECTIONS_FILE);
}

function normalizeEngineConfig(rawEngine, credentialKey) {
  assertObject(rawEngine ?? {}, 'Invalid engine config object.');
  return {
    [credentialKey]: normalizeOptionalString(rawEngine?.[credentialKey]) || null,
  };
}

export function loadConnectionProfiles(bridgeRoot) {
  const configuredPath = resolveConnectionsFilePath(bridgeRoot);
  const filePath = configuredPath;
  const exists = existsSync(filePath);
  if (!exists) {
    return {
      configuredPath,
      filePath: configuredPath,
      exists: false,
      hasConfiguredFile: false,
      defaultEnv: null,
      environments: {},
      aliasToEnv: {},
      environmentNames: [],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to parse ${filePath}: ${error.message}`);
  }

  assertObject(parsed, `Expected ${filePath} to contain a JSON object.`);
  const defaultEnvRaw = normalizeOptionalString(parsed.defaultEnv);
  const envs = parsed.environments ?? {};
  assertObject(envs, `Expected ${filePath} -> "environments" to be an object keyed by environment name.`);

  const environments = {};
  const aliasToEnv = {};

  for (const [name, rawEnv] of Object.entries(envs)) {
    const trimmedName = normalizeOptionalString(name);
    if (!trimmedName) continue;

    assertObject(rawEnv, `Expected environment "${trimmedName}" in ${filePath} to be an object.`);
    const description = normalizeOptionalString(rawEnv.description);
    const aliases = normalizeAliases(rawEnv.aliases, trimmedName, filePath);

    const normalizedEnvironment = {
      description: description || null,
      aliases,
    };

    for (const [engineName, credentialKey] of Object.entries(ENGINE_CREDENTIAL_MAP)) {
      const rawEngineConfig = rawEnv[engineName] ?? {};
      assertObject(rawEngineConfig, `Expected ${trimmedName}.${engineName} to be an object.`);
      normalizedEnvironment[engineName] = normalizeEngineConfig(rawEngineConfig, credentialKey);
    }

    environments[trimmedName] = normalizedEnvironment;

    for (const alias of [trimmedName, ...aliases]) {
      if (aliasToEnv[alias] && aliasToEnv[alias] !== trimmedName) {
        throw new Error(
          `Alias ${JSON.stringify(alias)} is defined for multiple environments (${aliasToEnv[alias]}, ${trimmedName}) in ${filePath}.`,
        );
      }
      aliasToEnv[alias] = trimmedName;
    }
  }

  const environmentNames = Object.keys(environments).sort();
  if (defaultEnvRaw && !environments[defaultEnvRaw]) {
    throw new Error(
      `Configured defaultEnv ${JSON.stringify(defaultEnvRaw)} was not found under environments in ${filePath}.`,
    );
  }

  const defaultEnv = defaultEnvRaw || null;

  return {
    configuredPath,
    filePath,
    exists: true,
    hasConfiguredFile: true,
    defaultEnv,
    environments,
    aliasToEnv,
    environmentNames,
  };
}

export function resolveEngineConnection({ bridgeRoot, engine, envNameFlag }) {
  const credentialKey = ENGINE_CREDENTIAL_MAP[engine];
  if (!credentialKey) {
    throw new Error(`Unsupported engine ${JSON.stringify(engine)}. Supported: ${Object.keys(ENGINE_CREDENTIAL_MAP).join(', ')}`);
  }

  const profiles = loadConnectionProfiles(bridgeRoot);
  const sessionEnvName = normalizeOptionalString(process.env.DB_INVESTIGATION_TOOL_ENV);
  const requestedToken = normalizeOptionalString(envNameFlag) || sessionEnvName || '';
  const requestedEnv = requestedToken ? profiles.aliasToEnv[requestedToken] ?? requestedToken : '';

  if (requestedEnv) {
    const envConfig = profiles.environments[requestedEnv];
    if (!envConfig) {
      const configured = profiles.environmentNames.length ? profiles.environmentNames.join(', ') : '(none configured)';
      throw new Error(
        `Unknown --env ${JSON.stringify(requestedToken)}. Configured environments: ${configured}. Update ${profiles.filePath}.`,
      );
    }

    const credential = envConfig[engine]?.[credentialKey];
    if (!credential) {
      throw new Error(
        `Environment ${JSON.stringify(requestedEnv)} is missing ${engine}.${credentialKey} in ${profiles.filePath}.`,
      );
    }

    return {
      value: credential,
      source: `connections:${requestedEnv}.${engine}.${credentialKey}`,
      envName: requestedEnv,
      profiles,
    };
  }

  throw new Error(
    `No connection profile was selected. Pass --env <name> or set DB_INVESTIGATION_TOOL_ENV for this session. Configured environments: ${profiles.environmentNames.length ? profiles.environmentNames.join(', ') : '(none configured)'}.`,
  );
}
