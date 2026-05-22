#!/usr/bin/env node
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const bridgeRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const engineDirs = {
  postgres: join(bridgeRoot, 'db-engines', 'postgres'),
  mongo: join(bridgeRoot, 'db-engines', 'mongo'),
  mysql: join(bridgeRoot, 'db-engines', 'mysql'),
  mariadb: join(bridgeRoot, 'db-engines', 'mariadb'),
  sqlserver: join(bridgeRoot, 'db-engines', 'sqlserver'),
  sqlite: join(bridgeRoot, 'db-engines', 'sqlite'),
  redis: join(bridgeRoot, 'db-engines', 'redis'),
  elasticsearch: join(bridgeRoot, 'db-engines', 'elasticsearch'),
  cassandra: join(bridgeRoot, 'db-engines', 'cassandra'),
  neo4j: join(bridgeRoot, 'db-engines', 'neo4j'),
};

const out = {
  bash_zsh: {
    setEnv: "export DB_INVESTIGATION_TOOL_ENV=local-dev",
    setSession: "export DB_INVESTIGATION_TOOL_LOG_DIR=2026-05-19_14-00-00_audit",
    postgres: `cd \"${engineDirs.postgres}\" && node query.mjs --env local-dev --file ./tmp-audit.sql`,
    mongo: `cd \"${engineDirs.mongo}\" && node query.mjs --env local-dev listDbs`,
    mysql: `cd \"${engineDirs.mysql}\" && node query.mjs --env local-dev --file ./tmp-audit.sql`,
    mariadb: `cd \"${engineDirs.mariadb}\" && node query.mjs --env local-dev --file ./tmp-audit.sql`,
    sqlserver: `cd \"${engineDirs.sqlserver}\" && node query.mjs --env local-dev --file ./tmp-audit.sql`,
    sqlite: `cd \"${engineDirs.sqlite}\" && node query.mjs --env local-dev --file ./tmp-audit.sql`,
    redis: `cd \"${engineDirs.redis}\" && node query.mjs --env local-dev info server`,
    elasticsearch: `cd \"${engineDirs.elasticsearch}\" && node query.mjs --env local-dev info`,
    cassandra: `cd \"${engineDirs.cassandra}\" && node query.mjs --env local-dev --file ./tmp-audit.cql`,
    neo4j: `cd \"${engineDirs.neo4j}\" && node query.mjs --env local-dev --file ./tmp-audit.cypher`,
  },
  fish: {
    setEnv: 'set -x DB_INVESTIGATION_TOOL_ENV local-dev',
    setSession: 'set -x DB_INVESTIGATION_TOOL_LOG_DIR 2026-05-19_14-00-00_audit',
    postgres: `cd \"${engineDirs.postgres}\"; node query.mjs --env local-dev --file ./tmp-audit.sql`,
    mongo: `cd \"${engineDirs.mongo}\"; node query.mjs --env local-dev listDbs`,
    mysql: `cd \"${engineDirs.mysql}\"; node query.mjs --env local-dev --file ./tmp-audit.sql`,
    mariadb: `cd \"${engineDirs.mariadb}\"; node query.mjs --env local-dev --file ./tmp-audit.sql`,
    sqlserver: `cd \"${engineDirs.sqlserver}\"; node query.mjs --env local-dev --file ./tmp-audit.sql`,
    sqlite: `cd \"${engineDirs.sqlite}\"; node query.mjs --env local-dev --file ./tmp-audit.sql`,
    redis: `cd \"${engineDirs.redis}\"; node query.mjs --env local-dev info server`,
    elasticsearch: `cd \"${engineDirs.elasticsearch}\"; node query.mjs --env local-dev info`,
    cassandra: `cd \"${engineDirs.cassandra}\"; node query.mjs --env local-dev --file ./tmp-audit.cql`,
    neo4j: `cd \"${engineDirs.neo4j}\"; node query.mjs --env local-dev --file ./tmp-audit.cypher`,
  },
  powershell: {
    setEnv: "$env:DB_INVESTIGATION_TOOL_ENV='local-dev'",
    setSession: "$env:DB_INVESTIGATION_TOOL_LOG_DIR='2026-05-19_14-00-00_audit'",
    postgres: `cd \"${engineDirs.postgres}\"; node query.mjs --env local-dev --file .\\tmp-audit.sql`,
    mongo: `cd \"${engineDirs.mongo}\"; node query.mjs --env local-dev listDbs`,
    mysql: `cd \"${engineDirs.mysql}\"; node query.mjs --env local-dev --file .\\tmp-audit.sql`,
    mariadb: `cd \"${engineDirs.mariadb}\"; node query.mjs --env local-dev --file .\\tmp-audit.sql`,
    sqlserver: `cd \"${engineDirs.sqlserver}\"; node query.mjs --env local-dev --file .\\tmp-audit.sql`,
    sqlite: `cd \"${engineDirs.sqlite}\"; node query.mjs --env local-dev --file .\\tmp-audit.sql`,
    redis: `cd \"${engineDirs.redis}\"; node query.mjs --env local-dev info server`,
    elasticsearch: `cd \"${engineDirs.elasticsearch}\"; node query.mjs --env local-dev info`,
    cassandra: `cd \"${engineDirs.cassandra}\"; node query.mjs --env local-dev --file .\\tmp-audit.cql`,
    neo4j: `cd \"${engineDirs.neo4j}\"; node query.mjs --env local-dev --file .\\tmp-audit.cypher`,
  },
  cmd: {
    setEnv: 'set DB_INVESTIGATION_TOOL_ENV=local-dev',
    setSession: 'set DB_INVESTIGATION_TOOL_LOG_DIR=2026-05-19_14-00-00_audit',
    postgres: `cd /d \"${engineDirs.postgres}\" && node query.mjs --env local-dev --file .\\tmp-audit.sql`,
    mongo: `cd /d \"${engineDirs.mongo}\" && node query.mjs --env local-dev listDbs`,
    mysql: `cd /d \"${engineDirs.mysql}\" && node query.mjs --env local-dev --file .\\tmp-audit.sql`,
    mariadb: `cd /d \"${engineDirs.mariadb}\" && node query.mjs --env local-dev --file .\\tmp-audit.sql`,
    sqlserver: `cd /d \"${engineDirs.sqlserver}\" && node query.mjs --env local-dev --file .\\tmp-audit.sql`,
    sqlite: `cd /d \"${engineDirs.sqlite}\" && node query.mjs --env local-dev --file .\\tmp-audit.sql`,
    redis: `cd /d \"${engineDirs.redis}\" && node query.mjs --env local-dev info server`,
    elasticsearch: `cd /d \"${engineDirs.elasticsearch}\" && node query.mjs --env local-dev info`,
    cassandra: `cd /d \"${engineDirs.cassandra}\" && node query.mjs --env local-dev --file .\\tmp-audit.cql`,
    neo4j: `cd /d \"${engineDirs.neo4j}\" && node query.mjs --env local-dev --file .\\tmp-audit.cypher`,
  },
};

console.log(JSON.stringify(out, null, 2));
