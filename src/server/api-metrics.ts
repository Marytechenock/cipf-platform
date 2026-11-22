import type { ApiAuditEntry, ApiMetrics, ApiMetricsQuery, ApiMetricsRange } from '../types';

export const API_METRICS_WINDOWS: Record<ApiMetricsRange, { durationMs: number; bucketMs: number }> = {
  '30m': { durationMs: 30 * 60_000, bucketMs: 60_000 },
  '1h': { durationMs: 60 * 60_000, bucketMs: 2 * 60_000 },
  '3h': { durationMs: 3 * 60 * 60_000, bucketMs: 5 * 60_000 },
  '6h': { durationMs: 6 * 60 * 60_000, bucketMs: 10 * 60_000 },
  '12h': { durationMs: 12 * 60 * 60_000, bucketMs: 15 * 60_000 },
  '24h': { durationMs: 24 * 60 * 60_000, bucketMs: 30 * 60_000 },
  '3d': { durationMs: 3 * 24 * 60 * 60_000, bucketMs: 90 * 60_000 },
  '5d': { durationMs: 5 * 24 * 60 * 60_000, bucketMs: 3 * 60 * 60_000 },
  '7d': { durationMs: 7 * 24 * 60 * 60_000, bucketMs: 4 * 60 * 60_000 }
};

export function createApiMetricsQuery(range: ApiMetricsRange, method = '', path = '', statusCode: number | null = null, now = Date.now()): ApiMetricsQuery {
  const window = API_METRICS_WINDOWS[range];
  return {
    range,
    from: new Date(now - window.durationMs).toISOString(),
    to: new Date(now).toISOString(),
    bucketMs: window.bucketMs,
    method,
    path,
    statusCode
  };
}

export function createEmptyApiMetrics(query: ApiMetricsQuery): ApiMetrics {
  const start = Date.parse(query.from);
  const bucketCount = Math.ceil((Date.parse(query.to) - start) / query.bucketMs);
  return {
    range: query.range,
    from: query.from,
    to: query.to,
    bucketMs: query.bucketMs,
    totalRequests: 0,
    errorRequests: 0,
    averageDurationMs: 0,
    statusCounts: [],
    buckets: Array.from({ length: bucketCount }, (_, index) => ({
      start: new Date(start + index * query.bucketMs).toISOString(),
      counts: {}
    })),
    topEndpoints: [],
    endpointOptions: [],
    statusCodeOptions: []
  };
}

export function summarizeApiMetrics(entries: ApiAuditEntry[], query: ApiMetricsQuery): ApiMetrics {
  const metrics = createEmptyApiMetrics(query);
  const from = Date.parse(query.from);
  const to = Date.parse(query.to);
  const inRange = entries.filter(entry => {
    const time = Date.parse(entry.time);
    return time >= from && time < to;
  });
  metrics.endpointOptions = [...new Set(inRange.map(entry => entry.path))].sort();
  metrics.statusCodeOptions = [...new Set(inRange.map(entry => entry.statusCode))].sort((a, b) => a - b);
  const filtered = inRange.filter(entry => (!query.method || entry.method === query.method)
    && (!query.path || entry.path === query.path)
    && (query.statusCode === null || entry.statusCode === query.statusCode));
  const statusCounts = new Map<number, number>();
  const endpointCounts = new Map<string, number>();
  let durationSum = 0;
  for (const entry of filtered) {
    metrics.totalRequests += 1;
    if (entry.statusCode >= 400) metrics.errorRequests += 1;
    durationSum += entry.durationMs;
    statusCounts.set(entry.statusCode, (statusCounts.get(entry.statusCode) || 0) + 1);
    endpointCounts.set(entry.path, (endpointCounts.get(entry.path) || 0) + 1);
    const index = Math.floor((Date.parse(entry.time) - from) / query.bucketMs);
    const bucket = metrics.buckets[index];
    if (bucket) bucket.counts[entry.statusCode] = (bucket.counts[entry.statusCode] || 0) + 1;
  }
  metrics.averageDurationMs = metrics.totalRequests ? Math.round(durationSum / metrics.totalRequests) : 0;
  metrics.statusCounts = [...statusCounts].map(([statusCode, count]) => ({ statusCode, count })).sort((a, b) => b.count - a.count || a.statusCode - b.statusCode);
  metrics.topEndpoints = [...endpointCounts].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)).slice(0, 5);
  return metrics;
}
