#!/usr/bin/env node
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadConnectionProfiles } from '../lib/connection-profiles.mjs';

const bridgeRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const profiles = loadConnectionProfiles(bridgeRoot);

const options = [];
for (const name of profiles.environmentNames) {
  const env = profiles.environments[name];
  options.push({
    id: name,
    targetEnvironment: name,
    label: env?.description ? `${name} — ${env.description}` : name,
  });
  for (const alias of env?.aliases ?? []) {
    options.push({
      id: alias,
      targetEnvironment: name,
      label: `${alias} (alias of ${name})`,
    });
  }
}
options.push({
  id: '__set_new_connection__',
  label: 'Set new connection',
});

const out = {
  configuredPath: profiles.configuredPath,
  filePath: profiles.filePath,
  defaultEnv: profiles.defaultEnv,
  options,
  newConnectionPromptTextarea:
    'Provide environment name, aliases (optional array), description, and any engine credentials you need: postgres.databaseUrl, mongo.mongoDbConnection, mysql.connectionUrl, mariadb.connectionUrl, sqlserver.connectionString, sqlite.filePath, redis.url, elasticsearch.nodeUrl, cassandra.connectionJson, neo4j.connectionJson.',
};

console.log(JSON.stringify(out, null, 2));
