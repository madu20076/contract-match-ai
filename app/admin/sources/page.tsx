'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  RefreshCw, Play, CheckCircle2, XCircle, Clock, Globe, MapPin,
  Building2, AlertTriangle, ToggleLeft, ToggleRight, Zap,
  SlidersHorizontal, ChevronDown, ChevronUp,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────

interface Source {
  slug:              string
  name:              string
  type:              string
  configured:        boolean
  live:              boolean
  enabled:           boolean
  lastRunAt:         string | null
  lastStatus:        string | null
  contractsImported: number
  importedToday:     number
  totalContracts:    number
}

interface SourcesData {
  supabaseConfigured: boolean
  sources: Source[]
}

interface SamFilters {
  naicsCode:  string
  agency:     string
  setAside:   string
  postedFrom: string
  postedTo:   string
  keyword:    string
}

const EMPTY_FILTERS: SamFilters = {
  naicsCode: '', agency: '', setAside: '', postedFrom: '', postedTo: '', keyword: '',
}

// Dedicated import routes for specific sources (others use /api/import/[slug])
const DEDICATED_IMPORT_ROUTE: Record<string, string> = {
  samgov: '/api/import/sam',
}

// Set-aside options for the SAM filter dropdown
const SET_ASIDE_OPTIONS = [
  { label: 'Small Business',                   value: 'SBA'     },
  { label: '8(a)',                              value: '8AN'     },
  { label: 'HUBZone',                          value: 'HZC'     },
  { label: 'WOSB',                             value: 'WOSB'    },
  { label: 'SDVOSB (competitive)',              value: 'SDVOSBC' },
  { label: 'SDVOSB (sole source)',              value: 'SDVOSBS' },
  { label: 'VOSB',                             value: 'VSB'     },
  { label: 'Unrestricted',                     value: 'OOSP'    },
]

// ── Helpers ──────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { badge: string; icon: React.ReactNode }> = {
  federal: { badge: 'bg-indigo-100 text-indigo-700',   icon: <Globe     className="w-3.5 h-3.5" /> },
  state:   { badge: 'bg-blue-100 text-blue-700',       icon: <MapPin    className="w-3.5 h-3.5" /> },
  city:    { badge: 'bg-emerald-100 text-emerald-700', icon: <Building2 className="w-3.5 h-3.5" /> },
  county:  { badge: 'bg-amber-100 text-amber-700',     icon: <Building2 className="w-3.5 h-3.5" /> },
}

const SOURCE_BADGE: Record<string, string> = {
  DIBBS:             'bg-amber-100 text-amber-700',
  'SAM.gov':         'bg-indigo-100 text-indigo-700',
  'Texas SmartBuy':  'bg-blue-100 text-blue-700',
  'Harris County':   'bg-violet-100 text-violet-700',
  'City of Houston': 'bg-emerald-100 text-emerald-700',
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)      return 'Just now'
  if (ms < 3_600_000)   return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000)  return `${Math.floor(ms / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StatusDot({ status }: { status: string | null }) {
  const base = 'w-2 h-2 rounded-full inline-block'
  if (status === 'completed') return <span className={`${base} bg-emerald-400`} />
  if (status === 'running')   return <span className={`${base} bg-blue-400 animate-pulse`} />
  if (status === 'failed')    return <span className={`${base} bg-red-400`} />
  return <span className={`${base} bg-slate-300`} />
}

function LastRunBadge({ status, at }: { status: string | null; at: string | null }) {
  if (!status && !at) return <span className="text-slate-400 text-xs">Never run</span>
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    completed: { cls: 'text-emerald-600', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    running:   { cls: 'text-blue-600',    icon: <RefreshCw    className="w-3.5 h-3.5 animate-spin" /> },
    failed:    { cls: 'text-red-500',     icon: <XCircle      className="w-3.5 h-3.5" /> },
    pending:   { cls: 'text-slate-400',   icon: <Clock        className="w-3.5 h-3.5" /> },
  }
  const { cls, icon } = map[status ?? 'pending'] ?? map.pending
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cls}`}>
      {icon} {relativeTime(at)}
    </span>
  )
}

// ── SAM filter panel ─────────────────────────────────────────

function SamFilterPanel({
  filters,
  onChange,
  onRun,
  onClear,
  running,
}: {
  filters:  SamFilters
  onChange: (f: SamFilters) => void
  onRun:    () => void
  onClear:  () => void
  running:  boolean
}) {
  const set = (key: keyof SamFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...filters, [key]: e.target.value })

  const hasFilters = Object.values(filters).some(v => v !== '')

  const inputCls  = 'w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-slate-300'
  const labelCls  = 'block text-xs font-medium text-slate-500 mb-1'

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div>
          <label className={labelCls}>NAICS Code</label>
          <input
            type="text" placeholder="e.g. 541512" maxLength={6}
            className={inputCls} value={filters.naicsCode}
            onChange={set('naicsCode')}
          />
        </div>
        <div>
          <label className={labelCls}>Agency</label>
          <input
            type="text" placeholder="e.g. Veterans Affairs"
            className={inputCls} value={filters.agency}
            onChange={set('agency')}
          />
        </div>
        <div>
          <label className={labelCls}>Set Aside</label>
          <select className={inputCls} value={filters.setAside} onChange={set('setAside')}>
            <option value="">Any</option>
            {SET_ASIDE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Posted From</label>
          <input type="date" className={inputCls} value={filters.postedFrom} onChange={set('postedFrom')} />
        </div>
        <div>
          <label className={labelCls}>Posted To</label>
          <input type="date" className={inputCls} value={filters.postedTo} onChange={set('postedTo')} />
        </div>
        <div>
          <label className={labelCls}>Keyword</label>
          <input
            type="text" placeholder="e.g. cybersecurity"
            className={inputCls} value={filters.keyword}
            onChange={set('keyword')}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onRun}
          disabled={running}
          className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
        >
          {running
            ? <><RefreshCw className="w-3 h-3 animate-spin" /> Running…</>
            : <><Play className="w-3 h-3" /> Run SAM.gov Import{hasFilters ? ' with Filters' : ''}</>}
        </button>
        {hasFilters && (
          <button
            onClick={onClear}
            className="text-xs text-slate-400 hover:text-slate-700 transition-colors underline underline-offset-2"
          >
            Clear filters
          </button>
        )}
        {hasFilters && (
          <span className="text-xs text-indigo-600 font-medium ml-1">
            {Object.values(filters).filter(v => v !== '').length} filter{Object.values(filters).filter(v => v !== '').length !== 1 ? 's' : ''} active
          </span>
        )}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function AdminSourcesPage() {
  const [data,     setData]     = useState<SourcesData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [running,  setRunning]  = useState<Record<string, boolean>>({})
  const [toggling, setToggling] = useState<Record<string, boolean>>({})
  const [runMsg,   setRunMsg]   = useState<Record<string, string>>({})

  // SAM.gov filter state
  const [samFilters,     setSamFilters]     = useState<SamFilters>(EMPTY_FILTERS)
  const [showSamFilters, setShowSamFilters] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sources')
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function runImport(slug: string, bodyOverride?: Record<string, string>) {
    setRunning(r => ({ ...r, [slug]: true }))
    setRunMsg(m => ({ ...m, [slug]: '' }))
    try {
      const route = DEDICATED_IMPORT_ROUTE[slug] ?? `/api/import/${slug}`
      const res   = await fetch(route, {
        method:  'POST',
        headers: bodyOverride ? { 'Content-Type': 'application/json' } : undefined,
        body:    bodyOverride ? JSON.stringify(bodyOverride) : undefined,
      })
      const json = await res.json() as Record<string, unknown>

      const imported  = (json.contracts_imported as number | undefined)
        ?? ((json.result as Record<string, number> | undefined)?.contracts_inserted ?? 0)
        +  ((json.result as Record<string, number> | undefined)?.contracts_updated  ?? 0)
      const errors    = (json.errors as string[] | undefined)
        ?? ((json.result as Record<string, string[]> | undefined)?.errors ?? [])
      const isLive    = json.live === true

      setRunMsg(m => ({
        ...m,
        [slug]: errors.length
          ? `Error: ${errors[0]}`
          : `${isLive ? '⚡ Live' : 'Mock'}: ${imported} contracts imported`,
      }))
    } catch (err) {
      setRunMsg(m => ({ ...m, [slug]: err instanceof Error ? err.message : 'Error' }))
    } finally {
      setRunning(r => ({ ...r, [slug]: false }))
      await load()
    }
  }

  function runSamWithFilters() {
    const body: Record<string, string> = {}
    if (samFilters.naicsCode)  body.naicsCode  = samFilters.naicsCode
    if (samFilters.agency)     body.agency     = samFilters.agency
    if (samFilters.setAside)   body.setAside   = samFilters.setAside
    if (samFilters.postedFrom) body.postedFrom = samFilters.postedFrom
    if (samFilters.postedTo)   body.postedTo   = samFilters.postedTo
    if (samFilters.keyword)    body.keyword    = samFilters.keyword
    runImport('samgov', Object.keys(body).length ? body : undefined)
  }

  async function toggleEnabled(slug: string, current: boolean) {
    setToggling(t => ({ ...t, [slug]: true }))
    try {
      await fetch('/api/sources', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ slug, enabled: !current }),
      })
      await load()
    } finally {
      setToggling(t => ({ ...t, [slug]: false }))
    }
  }

  async function runAll() {
    setRunning(r => ({ ...r, __all__: true }))
    try { await fetch('/api/import', { method: 'POST' }) }
    finally { setRunning(r => ({ ...r, __all__: false })); await load() }
  }

  // Total contracts imported today across all sources
  const importedTodayTotal = data?.sources.reduce((s, src) => s + src.importedToday, 0) ?? 0

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold text-slate-900">Contract Sources</span>
            {importedTodayTotal > 0 && (
              <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                +{importedTodayTotal} today
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/admin/api-test"   className="text-sm text-slate-500 hover:text-slate-900 hidden sm:inline">API Test →</Link>
            <Link href="/admin/contracts"  className="text-sm text-slate-500 hover:text-slate-900 hidden sm:inline">Import Runs →</Link>
            <Link href="/"                 className="text-sm text-slate-500 hover:text-slate-900 hidden sm:inline">← Home</Link>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 hover:text-slate-900 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={() => runImport('samgov')}
              disabled={!!running['samgov']}
              title="Run SAM.gov import → /api/import/sam"
              className="hidden sm:flex items-center gap-1.5 text-sm bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 disabled:opacity-60 text-indigo-700 font-medium px-4 py-1.5 rounded-lg transition-colors">
              {running['samgov']
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running…</>
                : <><Zap className="w-3.5 h-3.5" /> SAM.gov Import</>}
            </button>
            <button onClick={runAll} disabled={!!running['__all__']}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium px-4 py-1.5 rounded-lg transition-colors">
              {running['__all__']
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running…</>
                : <><Play className="w-3.5 h-3.5" /> Run All</>}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* No Supabase warning */}
        {data && !data.supabaseConfigured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-sm text-amber-800">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-semibold">Supabase not configured — showing connector list only</p>
              <p className="text-amber-700 mt-0.5 text-xs">
                Run <code className="bg-amber-100 px-1 rounded">docs/phase2_migration.sql</code> and add credentials to
                <code className="bg-amber-100 px-1 rounded mx-1">.env.local</code>.
              </p>
            </div>
          </div>
        )}

        {/* Today's import stats */}
        {data && importedTodayTotal > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3.5 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-emerald-800">{importedTodayTotal.toLocaleString()} contracts imported today</span>
              {' '}
              <span className="text-emerald-600 text-xs">
                across {data.sources.filter(s => s.importedToday > 0).length} source{data.sources.filter(s => s.importedToday > 0).length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        {/* Source list */}
        {data && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Procurement Sources</h2>
                <p className="text-xs text-slate-500 mt-0.5">{data.sources.length} sources configured</p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {data.sources.map((src) => {
                const typeStyle = TYPE_STYLE[src.type] ?? TYPE_STYLE.federal
                const badgeCls  = SOURCE_BADGE[src.name] ?? 'bg-slate-100 text-slate-600'
                const isSam     = src.slug === 'samgov'

                return (
                  <div key={src.slug} className="px-6 py-5">
                    <div className="flex items-start gap-4">

                      {/* Source info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${badgeCls}`}>
                            {src.name}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${typeStyle.badge}`}>
                            {typeStyle.icon} {src.type}
                          </span>
                          <StatusDot status={src.lastStatus} />
                          {src.live && (
                            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                              <Zap className="w-3 h-3" /> Live API
                            </span>
                          )}
                        </div>

                        {/* Stats */}
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2.5 text-xs text-slate-500">
                          <span>
                            <span className="font-medium text-slate-700">Last import:</span>{' '}
                            <LastRunBadge status={src.lastStatus} at={src.lastRunAt} />
                          </span>
                          <span>
                            <span className="font-medium text-slate-700">Total:</span>{' '}
                            <span className="text-slate-900 font-semibold">{src.totalContracts.toLocaleString()}</span>
                          </span>
                          <span>
                            <span className="font-medium text-slate-700">Last run:</span>{' '}
                            <span className={`font-medium ${src.contractsImported > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                              {src.contractsImported > 0 ? `+${src.contractsImported}` : '—'}
                            </span>
                          </span>
                          {src.importedToday > 0 && (
                            <span className="font-semibold text-emerald-600">
                              +{src.importedToday} today
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 font-medium ${src.configured ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${src.configured ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            {src.configured ? 'Configured' : 'No API key'}
                          </span>
                        </div>

                        {/* Run result */}
                        {runMsg[src.slug] && (
                          <p className="text-xs mt-2 text-slate-500 bg-slate-50 rounded-lg px-3 py-1.5 inline-block">
                            {runMsg[src.slug]}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isSam && (
                          <button
                            onClick={() => setShowSamFilters(v => !v)}
                            title="Show import filters"
                            className={`flex items-center gap-1 text-xs font-medium border rounded-lg px-2.5 py-1.5 transition-colors ${showSamFilters ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            Filters
                            {showSamFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}

                        {/* Toggle */}
                        <button
                          onClick={() => toggleEnabled(src.slug, src.enabled)}
                          disabled={!data.supabaseConfigured || !!toggling[src.slug]}
                          title={data.supabaseConfigured ? (src.enabled ? 'Disable' : 'Enable') : 'Requires Supabase'}
                          className={`transition-colors ${data.supabaseConfigured ? 'text-slate-400 hover:text-slate-700' : 'text-slate-300 cursor-not-allowed'}`}
                        >
                          {toggling[src.slug]
                            ? <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                            : src.enabled
                              ? <ToggleRight className="w-6 h-6 text-indigo-500" />
                              : <ToggleLeft  className="w-6 h-6" />}
                        </button>

                        {/* Run button (non-SAM sources, or SAM without filter panel) */}
                        {!isSam && (
                          <button
                            onClick={() => runImport(src.slug)}
                            disabled={!!running[src.slug]}
                            className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {running[src.slug]
                              ? <><RefreshCw className="w-3 h-3 animate-spin" /> Running…</>
                              : <><Play      className="w-3 h-3" /> Run Import</>}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* SAM filter panel */}
                    {isSam && showSamFilters && (
                      <SamFilterPanel
                        filters={samFilters}
                        onChange={setSamFilters}
                        onRun={runSamWithFilters}
                        onClear={() => setSamFilters(EMPTY_FILTERS)}
                        running={!!running['samgov']}
                      />
                    )}

                    {/* SAM quick-run button when filters panel is hidden */}
                    {isSam && !showSamFilters && (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => runImport('samgov')}
                          disabled={!!running['samgov']}
                          className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {running['samgov']
                            ? <><RefreshCw className="w-3 h-3 animate-spin" /> Running…</>
                            : <><Play      className="w-3 h-3" /> Run Import</>}
                        </button>
                        <span className="text-xs text-slate-400">or open Filters to narrow by NAICS, agency, set-aside, or date</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Setup guide */}
        <div className="bg-slate-100 rounded-xl p-5 text-sm text-slate-600">
          <p className="font-semibold text-slate-800 mb-3">Source Configuration</p>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
            {[
              { name: 'DIBBS',           key: 'DIBBS_ENABLED=true',    note: 'No key — public data' },
              { name: 'SAM.gov',         key: 'SAMGOV_API_KEY',        note: 'Free at api.sam.gov' },
              { name: 'Texas SmartBuy',  key: 'TEXAS_ESBD_API_KEY',    note: 'Register at txsmartbuy.com/sp' },
              { name: 'Harris County',   key: 'HARRIS_COUNTY_API_KEY', note: 'Contact gobonfire.com' },
              { name: 'City of Houston', key: 'HOUSTON_API_KEY',       note: 'Contact ionwave.net' },
            ].map(({ name, key, note }) => (
              <div key={name} className="flex items-baseline gap-2">
                <span className="font-medium text-slate-700 w-32 shrink-0">{name}</span>
                <code className="bg-white px-1.5 rounded text-slate-600">{key}</code>
                <span className="text-slate-400">{note}</span>
              </div>
            ))}
          </div>
        </div>

        {loading && !data && (
          <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span className="text-sm">Loading sources…</span>
          </div>
        )}
      </div>
    </div>
  )
}
