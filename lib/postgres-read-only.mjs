/** Gates for investigation-only Postgres: single read-only statement + allowlisted verb. */

export const READ_ONLY_VIOLATION_CODE = 'READ_ONLY_SQL_VIOLATION';

export class ReadOnlySqlViolation extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReadOnlySqlViolation';
    this.code = READ_ONLY_VIOLATION_CODE;
  }
}

const ALLOWED_ROOT_VERBS = new Set(['SELECT', 'WITH', 'VALUES', 'TABLE', 'SHOW', 'EXPLAIN']);

const BLOCKED_PATTERNS = [
  { re: /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|LOCK|CALL|DO)\b/i, reason: 'contains a mutating or administrative keyword' },
  { re: /\bFOR\s+(UPDATE|NO\s+KEY\s+UPDATE|SHARE|KEY\s+SHARE)\b/i, reason: 'contains row-locking clause' },
  { re: /\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i, reason: 'contains temporary table creation' }
];

/** Keywords allowed between EXPLAIN and the actual statement (PostgreSQL). */
const EXPLAIN_LEADING_OPTIONS = new Set([
  'ANALYZE',
  'VERBOSE',
  'BUFFERS',
  'COSTS',
  'WAL',
  'SETTINGS',
  'GENERIC_PLAN',
  'MEMORY',
  'SERIALIZE',
  'TIMING',
]);

function stripSqlCommentsAndStrings(sql) {
  let out = '';
  let i = 0;
  const len = sql.length;
  while (i < len) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < len && sql[i] !== '\n' && sql[i] !== '\r') i += 1;
      out += ' ';
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < len - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i = Math.min(len, i + 2);
      out += ' ';
      continue;
    }
    if (c === "'") {
      i += 1;
      while (i < len) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      out += ' ';
      continue;
    }
    if (c === '"') {
      i += 1;
      while (i < len) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      out += ' ';
      continue;
    }
    if (c === '$') {
      let j = i + 1;
      while (j < len && /[A-Za-z0-9_]/.test(sql[j])) j += 1;
      if (j < len && sql[j] === '$') {
        const tag = sql.slice(i, j + 1);
        const close = sql.indexOf(tag, j + 1);
        if (close === -1) return `${out} ${sql.slice(i)}`;
        i = close + tag.length;
        out += ' ';
        continue;
      }
    }
    out += c;
    i += 1;
  }
  return out;
}

function assertNoBlockedReadOnlyBypassPatterns(sql) {
  const scan = stripSqlCommentsAndStrings(sql);
  for (const { re, reason } of BLOCKED_PATTERNS) {
    if (re.test(scan)) {
      throw new ReadOnlySqlViolation(`Blocked SQL because it ${reason}. Use database-level read-only credentials as the primary safety boundary.`);
    }
  }
}

/**
 * True if any non-whitespace / non-comment content exists from `start` to end of `sql`.
 */
function hasSignificantTail(sql, start) {
  let i = start;
  const len = sql.length;
  while (i < len) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < len && sql[i] !== '\n' && sql[i] !== '\r') i += 1;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < len - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i = Math.min(len, i + 2);
      continue;
    }
    if (c === "'") {
      i += 1;
      while (i < len) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (c === '"') {
      i += 1;
      while (i < len) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (c === '$') {
      let j = i + 1;
      while (j < len && /[A-Za-z0-9_]/.test(sql[j])) j += 1;
      if (j < len && sql[j] === '$') {
        const tag = sql.slice(i, j + 1);
        const close = sql.indexOf(tag, j + 1);
        if (close === -1) return true;
        i = close + tag.length;
        continue;
      }
    }
    if (!/\s/.test(c)) return true;
    i += 1;
  }
  return false;
}

/**
 * If there is a `;` at bracket depth 0 outside strings/comments, and non-trivial SQL follows, throw.
 */
export function assertSingleTopLevelStatement(sql) {
  let i = 0;
  const len = sql.length;
  let depth = 0;
  while (i < len) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < len && sql[i] !== '\n' && sql[i] !== '\r') i += 1;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < len - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i = Math.min(len, i + 2);
      continue;
    }
    if (c === "'") {
      i += 1;
      while (i < len) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (c === '"') {
      i += 1;
      while (i < len) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (c === '$') {
      let j = i + 1;
      while (j < len && /[A-Za-z0-9_]/.test(sql[j])) j += 1;
      if (j < len && sql[j] === '$') {
        const tag = sql.slice(i, j + 1);
        const close = sql.indexOf(tag, j + 1);
        if (close === -1) throw new ReadOnlySqlViolation('Unterminated dollar-quoted string.');
        i = close + tag.length;
        continue;
      }
    }
    if (c === '(' || c === '[' || c === '{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (c === ')' || c === ']' || c === '}') {
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (c === ';' && depth === 0) {
      if (hasSignificantTail(sql, i + 1)) {
        throw new ReadOnlySqlViolation(
          'Multiple SQL statements are not allowed. Run one SELECT / SHOW / EXPLAIN at a time.',
        );
      }
      return;
    }
    i += 1;
  }
}

function skipWsAndComments(sql, i) {
  const len = sql.length;
  let p = i;
  while (p < len) {
    const c = sql[p];
    if (/\s/.test(c)) {
      p += 1;
      continue;
    }
    if (c === '-' && sql[p + 1] === '-') {
      p += 2;
      while (p < len && sql[p] !== '\n' && sql[p] !== '\r') p += 1;
      continue;
    }
    if (c === '/' && sql[p + 1] === '*') {
      p += 2;
      while (p < len - 1 && !(sql[p] === '*' && sql[p + 1] === '/')) p += 1;
      p = Math.min(len, p + 2);
      continue;
    }
    break;
  }
  return p;
}

function readIdentifierOrKeyword(sql, i) {
  const len = sql.length;
  let p = skipWsAndComments(sql, i);
  if (p >= len) return { word: '', next: p };
  const c0 = sql[p];
  if (!/[A-Za-z_]/.test(c0)) return { word: '', next: p };
  let end = p + 1;
  while (end < len && /[A-Za-z0-9_]/.test(sql[end])) end += 1;
  return { word: sql.slice(p, end).toUpperCase(), next: end };
}

function skipBalancedParens(sql, i) {
  if (sql[i] !== '(') return i;
  let depth = 0;
  let p = i;
  const len = sql.length;
  while (p < len) {
    const c = sql[p];
    if (c === '-' && sql[p + 1] === '-') {
      p += 2;
      while (p < len && sql[p] !== '\n' && sql[p] !== '\r') p += 1;
      continue;
    }
    if (c === '/' && sql[p + 1] === '*') {
      p += 2;
      while (p < len - 1 && !(sql[p] === '*' && sql[p + 1] === '/')) p += 1;
      p = Math.min(len, p + 2);
      continue;
    }
    if (c === "'") {
      p += 1;
      while (p < len) {
        if (sql[p] === "'") {
          if (sql[p + 1] === "'") {
            p += 2;
            continue;
          }
          p += 1;
          break;
        }
        p += 1;
      }
      continue;
    }
    if (c === '"') {
      p += 1;
      while (p < len) {
        if (sql[p] === '"') {
          if (sql[p + 1] === '"') {
            p += 2;
            continue;
          }
          p += 1;
          break;
        }
        p += 1;
      }
      continue;
    }
    if (c === '$') {
      let j = p + 1;
      while (j < len && /[A-Za-z0-9_]/.test(sql[j])) j += 1;
      if (j < len && sql[j] === '$') {
        const tag = sql.slice(p, j + 1);
        const close = sql.indexOf(tag, j + 1);
        if (close === -1) return len;
        p = close + tag.length;
        continue;
      }
    }
    if (c === '(') {
      depth += 1;
      p += 1;
      continue;
    }
    if (c === ')') {
      depth -= 1;
      p += 1;
      if (depth === 0) return p;
      continue;
    }
    p += 1;
  }
  return p;
}

/**
 * Returns the outermost SQL command keyword (after unwrapping EXPLAIN option lists).
 */
export function getRootSqlVerb(sql, depth = 0) {
  if (depth > 8) throw new ReadOnlySqlViolation('Too many nested EXPLAIN wrappers.');
  let p = skipWsAndComments(sql, 0);
  const { word, next } = readIdentifierOrKeyword(sql, p);
  if (!word) throw new ReadOnlySqlViolation('Could not read a SQL command keyword (expected SELECT, SHOW, etc.).');
  if (word === 'EXPLAIN') {
    let q = skipWsAndComments(sql, next);
    if (q < sql.length && sql[q] === '(') {
      q = skipBalancedParens(sql, q);
    }
    q = skipWsAndComments(sql, q);
    while (q < sql.length) {
      const optStart = skipWsAndComments(sql, q);
      const opt = readIdentifierOrKeyword(sql, optStart);
      if (!opt.word) break;
      if (!EXPLAIN_LEADING_OPTIONS.has(opt.word)) {
        return getRootSqlVerb(sql.slice(optStart), depth + 1);
      }
      q = opt.next;
    }
    throw new ReadOnlySqlViolation('EXPLAIN must be followed by a SELECT / WITH / VALUES / TABLE / SHOW statement.');
  }
  return word;
}

export function assertReadOnlyPostgresSql(sql) {
  const body = sql.replace(/^\uFEFF/, '').trim();
  if (!body) throw new ReadOnlySqlViolation('Empty SQL.');
  assertSingleTopLevelStatement(body);
  assertNoBlockedReadOnlyBypassPatterns(body);
  const verb = getRootSqlVerb(body);
  if (!ALLOWED_ROOT_VERBS.has(verb)) {
    throw new ReadOnlySqlViolation(
      `Blocked non read-only statement (starts with ${verb}). This bridge only allows: ${[...ALLOWED_ROOT_VERBS].sort().join(', ')}. If the investigation truly needs writes (UPDATE/DELETE/INSERT/DDL), stop and ask the user for explicit permission in chat before using any other client.`,
    );
  }
}
