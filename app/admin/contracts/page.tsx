'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  RefreshCw, Play, CheckCircle2, XCircle, Clock,
  Database, Globe, Building2, MapPin, AlertTriangle,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────

interface SourceStatus {
  slug: string
  name: string
  type: string
  configured: boolean
  lastRunAt: string | null
  enabled: boolean
}

interface ImportJob {
  id: string
  status: string
  started_at: string | null
  completed_at: string | null
  contracts_imported: number
  error_message: string | null
  created_at: string
  source: { slug: string; name: string; source_type: string } | null
}

interface NewContract {
  id: string
  title: string
  agency: string
  due_date: string
  naics_codes: string[]
  created_at: string
  source: { name: string } | null
}

interface DashboardData {
  supabaseConfigured: boolean
  sources: SourceStatus[]
  stats: {
    contractsToday: number
    jobsToday: number
    failedToday: number
    newContractsToday: number
  }
  recentJobs: ImportJob[]
  newContracts: NewContract[]
}

// ── Helpers ──────────────────────────────────────────────────

function sourceTypeBadge(type: string) {
  const colors: Record<string, string> = {
    federal: 'bg-indigo-100 text-indigo-700',
    state:   'bg-blue-100 text-blue-700',
    city:    'bg-emerald-100 text-emerald-700',
    county:  'bg-amber-100 text-amber-700',
  }
  return colors[type] ?? 'bg-slate-100 text-slate-600'
}

function statusBadge(status: string) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    completed: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    running:   { cls: 'bg-blue-50 text-blue-700 border-blue-200',          icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" /> },
    failed:    { cls: 'bg-red-50 text-red-700 border-red-200',             icon: <XCircle className="w-3.5 h-3.5" /> },
    pending:   { cls: 'bg-slate-50 text-slate-600 border-slate-200',       icon: <Clock className="w-3.5 h-3.5" /> },
  }
  const { cls, icon } = map[status] ?? map.pending
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {icon} {status}
    </span>
  )
}

function sourceTypeIcon(type: string) {
  if (type === 'federal') return <Globe className="w-3.5 h-3.5" />
  if (type === 'state')   return <MapPin className="w-3.5 h-3.5" />
  return <Building2 className="w-3.5 h-3.5" />
}

function duration(started: string | null, completed: string | null): string {
  if (!started) return '—'
  const ms = (completed ? new Date(completed) : new Date()).getTime() - new Date(started).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60000)      return 'just now'
  if (ms < 3_600_000)  return `${Math.floor(ms / 60000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

// ── Component ────────────────────────────────────────────────

export default function AdminContractsPage() {
  const [data, setData]             = useState<DashboardData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [running, setRunning]       = useState<Record<string, boolean>>({})
  const [runResults, setRunResults] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/import')
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function triggerImport(slug?: string) {
    const key = slug ?? 'all'
    setRunning((r) => ({ ...r, [key]: true }))
    setRunResults((r) => ({ ...r, [key]: '' }))
    try {
      const url  = slug ? `/api/import/${slug}` : '/api/import'
      const res  = await fetch(url, { method: 'POST' })
      const json = await res.json()
      if (slug) {
        const r = json.result
        setRunResults((prev) => ({
          ...prev,
          [key]: r.errors.length
            ? `Failed: ${r.errors[0]}`
            : `Done — ${r.contracts_inserted} inserted, ${r.contracts_updated} updated (${r.duration_ms}ms)`,
        }))
      } else {
        const summary = (json.results as Array<{ source_slug: string; contracts_inserted: number; errors: string[] }>)
          .map((r) => `${r.source_slug}: ${r.errors.length ? r.errors[0] : `${r.contracts_inserted} inserted`}`)
          .join(' · ')
        setRunResults((prev) => ({ ...prev, [key]: summary }))
      }
    } catch (err) {
      setRunResults((prev) => ({ ...prev, [key]: err instanceof Error ? err.message : 'Error' }))
    } finally {
      setRunning((r) => ({ ...r, [key]: false }))
      await load()
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold text-slate-900">Import Manager</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/sources" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">Sources →</Link>
            <Link href="/" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">← Home</Link>
            <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 hover:text-slate-900 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={() => triggerImport()} disabled={!!running['all']} className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium px-4 py-1.5 rounded-lg transition-colors">
              {running['all'] ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running…</> : <><Play className="w-3.5 h-3.5" /> Run All Imports</>}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {runResults['all'] && (
          <div className="bg-slate-900 text-slate-200 text-xs font-mono rounded-xl px-4 py-3">{runResults['all']}</div>
        )}

        {data && !data.supabaseConfigured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3 text-sm text-amber-800">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-semibold">Supabase not configured</p>
              <p className="text-amber-700 mt-1">Add credentials to <code className="bg-amber-100 px-1 rounded text-xs">.env.local</code> and run <code className="bg-amber-100 px-1 rounded text-xs">docs/phase2_migration.sql</code>. See <Link href="/debug" className="underline font-medium">/debug</Link>.</p>
            </div>
          </div>
        )}

        {/* Stats */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Contracts Today',   value: data.stats.contractsToday,    color: 'text-indigo-600' },
              { label: 'Import Runs Today', value: data.stats.jobsToday,         color: 'text-slate-700' },
              { label: 'Failed Today',      value: data.stats.failedToday,       color: data.stats.failedToday > 0 ? 'text-red-600' : 'text-slate-700' },
              { label: 'New Opportunities', value: data.stats.newContractsToday, color: 'text-emerald-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Source cards */}
        {data && (
          <div>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Sources</h2>
            <div className="grid sm:grid-cols-3 xl:grid-cols-5 gap-4">
              {data.sources.map((src) => (
                <div key={src.slug} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{src.name}</p>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full mt-1 ${sourceTypeBadge(src.type)}`}>
                        {sourceTypeIcon(src.type)} {src.type}
                      </span>
                    </div>
                    <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${src.configured ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                  </div>
                  <p className="text-xs text-slate-400 mb-3">Last: {relativeTime(src.lastRunAt)}</p>
                  {runResults[src.slug] && (
                    <p className="text-xs text-slate-500 bg-slate-50 rounded px-2 py-1 mb-2 break-words">{runResults[src.slug]}</p>
                  )}
                  <button
                    onClick={() => triggerImport(src.slug)}
                    disabled={!src.configured || !!running[src.slug]}
                    className="w-full flex items-center justify-center gap-1 text-xs font-medium border border-slate-200 rounded-lg py-1.5 text-slate-600 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {running[src.slug] ? <><RefreshCw className="w-3 h-3 animate-spin" /> Running…</> : <><Play className="w-3 h-3" /> Run</>}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent runs */}
        {data && data.recentJobs.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Recent Import Runs</h2>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-400 uppercase tracking-wider">
                      <th className="text-left px-4 py-3 font-medium">Source</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-left px-4 py-3 font-medium">Started</th>
                      <th className="text-right px-4 py-3 font-medium">Imported</th>
                      <th className="text-right px-4 py-3 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recentJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${sourceTypeBadge(job.source?.source_type ?? '')}`}>
                              {job.source?.source_type ?? '—'}
                            </span>
                            <span className="font-medium text-slate-800">{job.source?.name ?? '—'}</span>
                          </div>
                          {job.error_message && <p className="text-xs text-red-500 mt-0.5 truncate max-w-xs">{job.error_message}</p>}
                        </td>
                        <td className="px-4 py-3">{statusBadge(job.status)}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{relativeTime(job.started_at)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-medium">{job.contracts_imported}</td>
                        <td className="px-4 py-3 text-right text-slate-400 text-xs">{duration(job.started_at, job.completed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* New today */}
        {data && data.newContracts.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">New Opportunities Today</h2>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
              {data.newContracts.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0">
                    <Link href={`/contracts/${c.id}`} className="text-sm font-semibold text-slate-900 hover:text-indigo-600 transition-colors line-clamp-1">{c.title}</Link>
                    <p className="text-xs text-slate-500 mt-0.5">{c.agency}{c.source?.name && <> · <span className="text-indigo-600">{c.source.name}</span></>}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-slate-700">{new Date(c.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    <p className="text-xs text-slate-400 mt-1">{relativeTime(c.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data && data.recentJobs.length === 0 && data.newContracts.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
            <Database className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-600">No import runs yet</p>
            <p className="text-sm text-slate-400 mt-1 mb-6">Run <code className="bg-slate-100 px-1 rounded text-xs">docs/phase2_migration.sql</code>, then trigger an import.</p>
            <button onClick={() => triggerImport()} disabled={!!running['all']} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2.5 rounded-full text-sm transition-colors disabled:opacity-60">
              <Play className="w-4 h-4" /> Run All Imports
            </button>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}
      </div>
    </div>
  )
}
