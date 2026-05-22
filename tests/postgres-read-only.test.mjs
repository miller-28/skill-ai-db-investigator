import { assertReadOnlyPostgresSql } from '../lib/postgres-read-only.mjs';

function expectThrow(sql) {
  try {
    assertReadOnlyPostgresSql(sql);
    console.error('Expected failure but passed:', sql);
    process.exitCode = 1;
  } catch (e) {
    // expected
  }
}

function expectPass(sql) {
  try {
    assertReadOnlyPostgresSql(sql);
  } catch (e) {
    console.error('Expected pass but failed:', sql, e.message);
    process.exitCode = 1;
  }
}

// blocked cases
expectThrow('SELECT 1; DROP TABLE users;');
expectThrow('WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x;');
expectThrow('SELECT * FROM users FOR UPDATE;');
expectThrow('LOCK TABLE users;');
expectThrow('EXPLAIN ANALYZE DELETE FROM users;');
expectThrow('CREATE TEMP TABLE x AS SELECT 1;');
expectThrow('COPY users TO \'/tmp/file\'' );

// allowed
expectPass('SELECT 1');
expectPass('WITH t AS (SELECT 1) SELECT * FROM t');
expectPass('EXPLAIN SELECT 1');
