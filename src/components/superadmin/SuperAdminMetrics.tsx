import { useEffect, useState } from 'react';
import { Activity, AlertCircle, Clock3, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import type { ApiMetrics, ApiMetricsRange } from '../../types';

const ranges: Array<{ value: ApiMetricsRange; label: string }> = [
  { value: '30m', label: 'Last 30 minutes' },
  { value: '1h', label: 'Last hour' },
  { value: '3h', label: 'Last 3 hours' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '12h', label: 'Last 12 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '3d', label: 'Last 3 days' },
  { value: '5d', label: 'Last 5 days' },
  { value: '7d', label: 'Last 7 days' }
];

const formatCount = (count: number) => new Intl.NumberFormat().format(count);
const statusPalette = ['#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#2563eb', '#db2777', '#475569'];
const statusColor = (statusCode: number, index: number) => {
  if (statusCode >= 500) return '#7c3aed';
  if (statusCode >= 400) return ({ 400: '#d97706', 401: '#ea580c', 403: '#be123c', 404: '#dc2626', 409: '#db2777', 429: '#9333ea' } as Record<number, string>)[statusCode] || '#b91c1c';
  return statusPalette[index % statusPalette.length];
};

function StatusChart({ metrics, darkMode }: { metrics: ApiMetrics; darkMode: boolean }) {
  const width = 960;
  const height = 280;
  const left = 48;
  const right = 18;
  const top = 18;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const codes = metrics.statusCounts.map(item => item.statusCode);
  const highest = Math.max(0, ...metrics.buckets.flatMap(bucket => codes.map(code => bucket.counts[code] || 0)));
  const scaleMax = highest <= 4 ? 4 : Math.ceil(highest / 4) * 4;
  const x = (index: number) => left + (metrics.buckets.length <= 1 ? plotWidth / 2 : index * plotWidth / (metrics.buckets.length - 1));
  const y = (count: number) => top + plotHeight - count * plotHeight / scaleMax;
  const labels = [0, 1, 2, 3, 4].map(step => Math.round(step * (metrics.buckets.length - 1) / 4));
  const formatTime = (value: string) => new Intl.DateTimeFormat(undefined,
    metrics.range.endsWith('d') ? { month: 'short', day: 'numeric', hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' }
  ).format(new Date(value));

  if (!metrics.totalRequests) {
    return <div className="flex h-64 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">No API requests in this time range.</div>;
  }

  return <>
    <div className="overflow-x-auto">
    <svg role="img" aria-label="HTTP status codes over time" viewBox={`0 0 ${width} ${height}`} className="h-72 min-w-[860px] w-full">
      {[0, 1, 2, 3, 4].map(step => {
        const value = step * scaleMax / 4;
        return <g key={step}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke={darkMode ? '#334155' : '#e2e8f0'} strokeDasharray={step === 0 ? undefined : '4 5'} /><text x={left - 10} y={y(value) + 4} textAnchor="end" fill={darkMode ? '#cbd5e1' : '#64748b'} fontSize="11">{value}</text></g>;
      })}
      {labels.map((index, position) => <text key={position} x={x(index)} y={height - 9} textAnchor={position === 0 ? 'start' : position === 4 ? 'end' : 'middle'} fill={darkMode ? '#cbd5e1' : '#64748b'} fontSize="11">{formatTime(metrics.buckets[index].start)}</text>)}
      {codes.map((code, index) => {
        const color = statusColor(code, index);
        const points = metrics.buckets.map((bucket, bucketIndex) => `${x(bucketIndex)},${y(bucket.counts[code] || 0)}`).join(' ');
        return <g key={code}>
          <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {metrics.buckets.map((bucket, bucketIndex) => bucket.counts[code] ? <circle key={bucketIndex} cx={x(bucketIndex)} cy={y(bucket.counts[code])} r="3.5" fill={color}><title>{formatTime(bucket.start)} · HTTP {code}: {bucket.counts[code]} requests</title></circle> : null)}
        </g>;
      })}
    </svg>
    </div>
    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
      {metrics.statusCounts.map(({ statusCode, count }, index) => <span key={statusCode} className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor(statusCode, index) }} />HTTP {statusCode} <strong className="text-slate-900 dark:text-slate-100">{formatCount(count)}</strong></span>)}
    </div>
  </>;
}

export default function SuperAdminMetrics({ darkMode }: { darkMode: boolean }) {
  const [range, setRange] = useState<ApiMetricsRange>('3h');
  const [method, setMethod] = useState('');
  const [path, setPath] = useState('');
  const [code, setCode] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.getSuperAdminMetrics({ range, method, path, code }).then(result => {
      if (active) setMetrics(result);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load API metrics.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range, method, path, code, refreshKey]);

  const errorRate = metrics?.totalRequests ? Math.round(metrics.errorRequests / metrics.totalRequests * 100) : 0;
  const endpointOptions = metrics?.endpointOptions || [];
  const codeOptions = metrics?.statusCodeOptions || [];
  const filterClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-[#202A36] dark:text-slate-100';

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-black">Metrics</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">API activity and system health from the audit log.</p></div>
      <button type="button" onClick={() => setRefreshKey(key => key + 1)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-white/10"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh</button>
    </div>

    <div className="flex flex-wrap items-end gap-3">
      <label className="w-full text-xs font-semibold text-slate-600 dark:text-slate-300 sm:w-44">Time range<select value={range} onChange={event => setRange(event.target.value as ApiMetricsRange)} className={filterClass}>{ranges.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="w-full text-xs font-semibold text-slate-600 dark:text-slate-300 sm:w-36">HTTP method<select value={method} onChange={event => setMethod(event.target.value)} className={filterClass}><option value="">All methods</option>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="w-full text-xs font-semibold text-slate-600 dark:text-slate-300 sm:w-64">Endpoint<select value={path} onChange={event => setPath(event.target.value)} className={filterClass}><option value="">All endpoints</option>{path && !endpointOptions.includes(path) && <option value={path}>{path}</option>}{endpointOptions.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="w-full text-xs font-semibold text-slate-600 dark:text-slate-300 sm:w-36">HTTP code<select value={code} onChange={event => setCode(event.target.value)} className={filterClass}><option value="">All codes</option>{code && !codeOptions.includes(Number(code)) && <option value={code}>{code}</option>}{codeOptions.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>

    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
    {!metrics && loading ? <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading API metrics…</div> : metrics && <div aria-busy={loading} className={loading ? 'opacity-60' : ''}>
      <div className="mt-6 grid gap-x-8 gap-y-4 border-y border-slate-200 py-5 dark:border-slate-700 sm:grid-cols-2 xl:grid-cols-4">
        <div><Activity size={17} className="text-[#8B6914] dark:text-amber-300" /><p className="mt-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Requests</p><p className="mt-1 text-2xl font-black">{formatCount(metrics.totalRequests)}</p></div>
        <div><Activity size={17} className="text-green-700 dark:text-green-300" /><p className="mt-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Successful</p><p className="mt-1 text-2xl font-black">{formatCount(metrics.totalRequests - metrics.errorRequests)}</p></div>
        <div><AlertCircle size={17} className="text-red-600 dark:text-red-300" /><p className="mt-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Errors</p><p className="mt-1 text-2xl font-black">{formatCount(metrics.errorRequests)} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{errorRate}%</span></p></div>
        <div><Clock3 size={17} className="text-sky-700 dark:text-sky-300" /><p className="mt-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Average response</p><p className="mt-1 text-2xl font-black">{formatCount(metrics.averageDurationMs)} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ms</span></p></div>
      </div>
      <section className="mt-7 border-b border-slate-200 pb-7 dark:border-slate-700"><h2 className="text-base font-bold">HTTP status codes</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Requests per time interval, grouped by response code.</p><div className="mt-4"><StatusChart metrics={metrics} darkMode={darkMode} /></div></section>
      <section className="mt-7 pb-5"><h2 className="text-base font-bold">Most requested endpoints</h2>{metrics.topEndpoints.length ? <div className="mt-4 space-y-3">{metrics.topEndpoints.map(item => <div key={item.path} className="grid items-center gap-2 text-xs sm:grid-cols-[minmax(0,1fr)_72px]"><div className="min-w-0"><p className="truncate font-mono text-slate-700 dark:text-slate-300" title={item.path}>{item.path}</p><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"><div className="h-full rounded-full bg-[#B8922A]" style={{ width: `${item.count / metrics.totalRequests * 100}%` }} /></div></div><strong className="text-right">{formatCount(item.count)}</strong></div>)}</div> : <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No endpoints in this time range.</p>}</section>
      <p className="mt-3 text-right text-xs text-slate-500 dark:text-slate-400">Updated {new Date(metrics.to).toLocaleString()}</p>
    </div>}
  </div>;
}
