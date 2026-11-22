import assert from 'node:assert/strict';
import test from 'node:test';
import type { ApiAuditEntry } from '../types';
import { createApiMetricsQuery, summarizeApiMetrics } from './api-metrics';

test('API metrics counts statuses and time buckets without including older requests', () => {
  const now = Date.parse('2026-11-21T12:00:00.000Z');
  const entry = (id: string, time: string, statusCode: number, method: string, path: string, durationMs: number): ApiAuditEntry => ({
    id, time, statusCode, method, path, durationMs, actorName: 'System Owner'
  });
  const entries = [
    entry('1', '2026-11-21T11:56:00.000Z', 200, 'GET', '/api/sessions', 40),
    entry('2', '2026-11-21T11:58:00.000Z', 200, 'GET', '/api/sessions', 60),
    entry('3', '2026-11-21T11:59:00.000Z', 500, 'POST', '/api/admin/users', 200),
    entry('4', '2026-11-21T10:00:00.000Z', 404, 'GET', '/api/older', 10)
  ];
  const result = summarizeApiMetrics(entries, createApiMetricsQuery('30m', '', '', null, now));
  assert.equal(result.totalRequests, 3);
  assert.equal(result.errorRequests, 1);
  assert.equal(result.averageDurationMs, 100);
  assert.deepEqual(result.statusCounts, [{ statusCode: 200, count: 2 }, { statusCode: 500, count: 1 }]);
  assert.deepEqual(result.endpointOptions, ['/api/admin/users', '/api/sessions']);
  assert.deepEqual(result.statusCodeOptions, [200, 500]);
  assert.equal(result.buckets.reduce((count, bucket) => count + (bucket.counts[200] || 0), 0), 2);
  assert.deepEqual(result.topEndpoints[0], { path: '/api/sessions', count: 2 });

  const filtered = summarizeApiMetrics(entries, createApiMetricsQuery('30m', 'GET', '/api/sessions', null, now));
  assert.equal(filtered.totalRequests, 2);
  assert.equal(filtered.errorRequests, 0);
  assert.deepEqual(filtered.statusCounts, [{ statusCode: 200, count: 2 }]);
  const codeFiltered = summarizeApiMetrics(entries, createApiMetricsQuery('30m', '', '', 500, now));
  assert.equal(codeFiltered.totalRequests, 1);
  assert.deepEqual(codeFiltered.statusCounts, [{ statusCode: 500, count: 1 }]);
});
