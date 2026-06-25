'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  RefreshCw, Sparkles, Clock, CheckCircle2, XCircle,
  AlertTriangle, Play, RotateCcw, ArrowLeft,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────

interface QueueStats {
  pending:       number
  processing:    number
  completed:     number
  failed:        number
  avgDurationMs: number | null
}

interface JobRow {
  id:            string
  contract_id:   string
  contract_title?: string
  status:        string
  error_message: string | null
  created_at:    string
  started_at:    string | null
  completed_at:  string | null
}

// ── Helpers ───────────────────────────────────────────────────

function fmtDuration(ms: number | null) {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// ── Stat chip ─────────────────────────────────────────────────

function StatChip({
  label, value, color,
}: { label: string; value: number | string; color: string }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border p-5 ${color}`}>
      <span className="text-3xl font-black">{value}</span>
      <span className="text-xs font-semibold mt-1 uppercase tracking-wide opacity-70">{label}</span>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending:    'bg-slate-100 text-slate-600',
    processing: 'bg-blue-100 text-blue-700',
    completed:  'bg-emerald-100 text-emerald-700',
    failed:     'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────

export default function AdminAiPage() {
  const [stats,     setStats]     = useState<QueueStats | null>(null)
  const [jobs,      setJobs]      = useState<JobRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [running,   setRunning]   = useState(false)
  const [runResult, setRunResult] = useState<{ processed: number; failed: number } | null>(null)
  const [tick,      setTick]      = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/jobs/process-briefs')
      .then(r => r.json())
      .then((data: { stats: QueueStats; jobs: JobRow[] }) => {
        if (cancelled) return
        setStats(data.stats)
        setJobs(data.jobs)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tick])

  async function processQueue(retry = false) {
    setRunning(true)
    setRunResult(null)
    try {
      const url = `/api/jobs/process-briefs${retry ? '?retry=true' : ''}`
      const res  = await fetch(url, { method: 'POST' })
      const data = await res.json() as { processed: number; failed: number }
      setRunResult(data)
      setLoading(true)
      setTick(t => t + 1)
    } finally {
      setRunning(false)
    }
  }

  const pendingJobs  = jobs.filter((j) => j.status === 'pending')
  const failedJobs   = jobs.filter((j) => j.status === 'failed')
  const recentDoneJobs = jobs.filter((j) => j.status === 'completed').slice(0, 10)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/sources" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Admin
        </Link>
        <span className="text-slate-300">/</span>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <h1 className="text-sm font-bold text-slate-900">AI Brief Generator</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => { setLoading(true); setTick(t => t + 1) }}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatChip label="Pending"    value={stats?.pending    ?? '—'} color="bg-slate-50 border-slate-200 text-slate-800" />
          <StatChip label="Processing" value={stats?.processing ?? '—'} color="bg-blue-50 border-blue-200 text-blue-900" />
          <StatChip label="Completed"  value={stats?.completed  ?? '—'} color="bg-emerald-50 border-emerald-200 text-emerald-900" />
          <StatChip label="Failed"     value={stats?.failed     ?? '—'} color="bg-red-50 border-red-200 text-red-900" />
          <StatChip label="Avg Time"   value={fmtDuration(stats?.avgDurationMs ?? null)} color="bg-indigo-50 border-indigo-200 text-indigo-900" />
        </div>

        {/* Run result banner */}
        {runResult && (
          <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
            runResult.failed === 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            {runResult.failed === 0
              ? <CheckCircle2 className="w-4 h-4" />
              : <AlertTriangle className="w-4 h-4" />}
            Processed {runResult.processed} job{runResult.processed !== 1 ? 's' : ''}.
            {runResult.failed > 0 && ` ${runResult.failed} failed.`}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => processQueue(false)}
            disabled={running || (stats?.pending ?? 0) === 0}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Process Queue ({stats?.pending ?? 0} pending)
          </button>

          {(stats?.failed ?? 0) > 0 && (
            <button
              onClick={() => processQueue(true)}
              disabled={running}
              className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Retry Failed ({stats?.failed ?? 0})
            </button>
          )}
        </div>

        {/* Pending jobs table */}
        {pendingJobs.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              Pending ({pendingJobs.length})
            </h2>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Contract</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Queued</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/contracts/${job.contract_id}`} className="text-indigo-600 hover:underline line-clamp-1">
                          {job.contract_title ?? job.contract_id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(job.created_at)}</td>
                      <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Failed jobs table */}
        {failedJobs.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              Failed ({failedJobs.length})
            </h2>
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-red-50 border-b border-red-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-red-700 uppercase">Contract</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-red-700 uppercase">Error</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-red-700 uppercase">Failed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {failedJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-red-50">
                      <td className="px-4 py-3">
                        <Link href={`/contracts/${job.contract_id}`} className="text-indigo-600 hover:underline line-clamp-1">
                          {job.contract_title ?? job.contract_id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-red-700 text-xs max-w-xs truncate">{job.error_message ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(job.completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Recent completed */}
        {recentDoneJobs.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Recently Completed
            </h2>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Contract</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Duration</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentDoneJobs.map((job) => {
                    const dur = job.started_at && job.completed_at
                      ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
                      : null
                    return (
                      <tr key={job.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <Link href={`/contracts/${job.contract_id}`} className="text-indigo-600 hover:underline line-clamp-1">
                            {job.contract_title ?? job.contract_id}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{fmtDuration(dur)}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(job.completed_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!loading && jobs.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Sparkles className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm">No brief jobs yet. Run an import to generate opportunities.</p>
            <Link href="/admin/sources" className="text-sm text-indigo-500 hover:underline mt-2 inline-block">
              Go to Import Sources →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
