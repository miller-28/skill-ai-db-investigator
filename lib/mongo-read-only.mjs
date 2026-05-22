import { ReadOnlySqlViolation } from './postgres-read-only.mjs';

const WRITE_STAGES = new Set(['$out', '$merge']);
function scanAggregateValue(value, path) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) scanAggregateValue(value[i], `${path}[${i}]`);
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (WRITE_STAGES.has(k)) {
        throw new ReadOnlySqlViolation(
          `Blocked aggregate stage ${k} at ${path}.${k}. This bridge is read-only. If you need $out, $merge, or other writes, ask the user for explicit permission in chat and use another tool.`,
        );
      }
      scanAggregateValue(v, `${path}.${k}`);
    }
  }
}

/**
 * Rejects pipelines that contain $out / $merge (including nested under $facet etc.).
 */
export function assertReadOnlyAggregatePipeline(pipeline, path = 'pipeline') {
  if (!Array.isArray(pipeline)) {
    throw new ReadOnlySqlViolation('aggregate pipeline must be a JSON array.');
  }
  scanAggregateValue(pipeline, path);
}
