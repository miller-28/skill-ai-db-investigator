import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function sanitizePathSegment(raw, fallback) {
  const value = String(raw || '').trim();
  const safe = value
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .replace(/^-+|-+$/g, '');
  return safe || fallback;
}

/**
 * Ensure per-user runtime context store exists under:
 * `<bridgeRoot>/db-context/<envName>/<engine>/`
 * If missing files, seed from committed template:
 * `<bridgeRoot>/db-context-template/<engine>/`
 * Existing runtime files are preserved.
 */
export function ensureUserContextStore({ bridgeRoot, envName, engine }) {
  const normalizedEnvironment = sanitizePathSegment(envName, 'unresolved-env');
  const normalizedEngine = sanitizePathSegment(engine, 'unknown-engine');
  const templateDir = join(bridgeRoot, 'db-context-template', normalizedEngine);
  const runtimeDir = join(bridgeRoot, 'db-context', normalizedEnvironment, normalizedEngine);

  if (!existsSync(templateDir)) return { runtimeDir, seeded: false };
  mkdirSync(runtimeDir, { recursive: true });

  let copied = 0;
  for (const name of readdirSync(templateDir)) {
    const src = join(templateDir, name);
    const dst = join(runtimeDir, name);
    if (!statSync(src).isFile()) continue;
    if (existsSync(dst)) continue;
    copyFileSync(src, dst);
    copied += 1;
  }

  return { runtimeDir, seeded: copied > 0 };
}
