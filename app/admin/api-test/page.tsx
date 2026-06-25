'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, Wifi, WifiOff,
  Clock, Building2, MapPin, Hash, Calendar, DollarSign, ArrowLeft,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────

interface SamOpportunity {
  title:              string
  agency:             string
  location:           string
  solicitationNumber: string
  naicsCode:          string
  dueDate:            string
  postedDate:         string
  setAside:           string | null
  valueRange:         string | null
}

interface TestResult {
  reachable:    boolean
  live:         boolean
  mock:         boolean
  testedAt:     string
  httpStatus?:  number
  message?:     string
  totalRecords: number
  opportunities: SamOpportunity[]
  errors:        string[]
}

// ── Helpers ──────────────────────────────────────────────────

const SET_ASIDE_STYLE: Record<string, string> = {
  SDVOSB:   'bg-blue-50 text-blue-700 border-blue-200',
  SDVOSBC:  'bg-blue-50 text-blue-700 border-blue-200',
  SDVOSBS:  'bg-blue-50 text-blue-700 border-blue-200',
  'WOSB':   'bg-pink-50 text-pink-700 border-pink-200',
  'EDWOSB': 'bg-pink-50 text-pink-700 border-pink-200',
  '8(a)':   'bg-purple-50 text-purple-700 border-purple-200',
  '8AN':    'bg-purple-50 text-purple-700 border-purple-200',
  HUBZone:  'bg-amber-50 text-amber-700 border-amber-200',
  HZC:      'bg-amber-50 text-amber-700 border-amber-200',
  VOSB:     'bg-teal-50 text-teal-700 border-teal-200',
  VSB:      'bg-teal-50 text-teal-700 border-teal-200',
}

function SetAsideBadge({ code }: { code: string | null }) {
  if (!code) return null
  const cls = SET_ASIDE_STYLE[code] ?? 'bg-slate-50 text-slate-600 border-slate-200'
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border ${cls}`}>
      {code}
    </span>
  )
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ── Status banner (module scope) ──────────────────────────────

function StatusBanner({ result }: { result: TestResult | null }) {
  if (!result) return null

  if (result.mock) {
    return (
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800 text-sm">No API key configured — showing mock data</p>
          <p className="text-amber-700 text-xs mt-0.5">{result.message ?? 'Add SAMGOV_API_KEY to .env.local to test live connectivity.'}</p>
        </div>
      </div>
    )
  }

  if (result.errors.length > 0) {
    return (
      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
        <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-red-800 text-sm">SAM.gov API error</p>
          {result.errors.map((e, i) => (
            <p key={i} className="text-red-700 text-xs mt-0.5 font-mono">{e}</p>
          ))}
          {result.httpStatus && (
            <p className="text-red-500 text-xs mt-1">HTTP {result.httpStatus}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-emerald-800 text-sm">SAM.gov API reachable</p>
        <p className="text-emerald-700 text-xs mt-0.5">
          Live connection confirmed — {result.totalRecords.toLocaleString()} active opportunities in the last 30 days.
        </p>
      </div>
    </div>
  )
}

// ── Stat chips (module scope) ──────────────────────────────────

function Stats({ result, tested }: { result: TestResult | null; tested: boolean }) {
  if (!result) return null
  const chips = [
    {
      label: 'API Reachable',
      value: result.mock ? 'Mock mode' : result.reachable ? 'Yes' : 'No',
      icon:  result.reachable || result.mock
        ? <Wifi className="w-4 h-4 text-emerald-500" />
        : <WifiOff className="w-4 h-4 text-red-400" />,
      color: result.reachable && !result.mock ? 'text-emerald-700' : result.mock ? 'text-amber-600' : 'text-red-600',
    },
    {
      label: 'Data source',
      value: result.mock ? 'Mock' : 'Live API',
      icon:  <Hash className="w-4 h-4 text-slate-400" />,
      color: result.live ? 'text-indigo-700' : 'text-amber-600',
    },
    {
      label: 'Total opportunities',
      value: result.totalRecords.toLocaleString(),
      icon:  <DollarSign className="w-4 h-4 text-slate-400" />,
      color: 'text-slate-900',
    },
    {
      label: 'Last tested',
      value: tested ? fmtTime(result.testedAt) : '—',
      icon:  <Clock className="w-4 h-4 text-slate-400" />,
      color: 'text-slate-600',
    },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {chips.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">{c.icon}{c.label}</div>
          <p className={`text-sm font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Opportunity list (module scope) ───────────────────────────

function OpportunityList({ result }: { result: TestResult | null }) {
  if (!result || result.opportunities.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
        {result?.errors.length ? 'No opportunities — API returned an error.' : 'No opportunities in the selected date range.'}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {result.opportunities.map((opp, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">SAM.gov</span>
                <SetAsideBadge code={opp.setAside} />
                {result.mock && (
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">Mock</span>
                )}
              </div>
              <h3 className="text-sm font-semibold text-slate-900 leading-snug">{opp.title}</h3>
            </div>
            {opp.valueRange && (
              <span className="text-sm font-bold text-slate-700 shrink-0 whitespace-nowrap">{opp.valueRange}</span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{opp.agency}</span>
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{opp.location}</span>
            <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{opp.solicitationNumber}</span>
            <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />NAICS {opp.naicsCode}</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Due {opp.dueDate}
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              Posted {opp.postedDate}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function ApiTestPage() {
  const [result,  setResult]  = useState<TestResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [tested,  setTested]  = useState(false)
  const [tick,    setTick]    = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/test-sam', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: TestResult) => {
        if (cancelled) return
        setResult(data)
        setTested(true)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          reachable: false, live: false, mock: false,
          testedAt:  new Date().toISOString(),
          totalRecords: 0, opportunities: [],
          errors: [err instanceof Error ? err.message : 'Unknown error'],
        })
        setTested(true)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [tick])

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/sources"
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Sources
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-900 text-sm">SAM.gov API Test</span>
          </div>
          <button
            onClick={() => { setLoading(true); setTick(t => t + 1) }}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Testing…' : 'Test Connection'}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">SAM.gov Connectivity Test</h1>
          <p className="text-sm text-slate-500 mt-1">
            Calls <code className="bg-slate-100 px-1 rounded text-xs">GET /api/test-sam</code> →
            SAM.gov Opportunities API v2 — last 30 days, active solicitations.
          </p>
        </div>

        {loading && !result ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin" />
            <p className="text-sm">Contacting SAM.gov API…</p>
          </div>
        ) : (
          <>
            <StatusBanner result={result} />
            <Stats result={result} tested={tested} />

            <div>
              <h2 className="text-base font-semibold text-slate-900 mb-3">
                {result?.mock ? 'Sample Opportunities (Mock)' : `Sample Opportunities (up to 5 of ${(result?.totalRecords ?? 0).toLocaleString()})`}
              </h2>
              <OpportunityList result={result} />
            </div>

            {/* Setup instructions shown only when not live */}
            {result && !result.live && (
              <div className="bg-slate-100 rounded-xl p-5 text-sm text-slate-600 space-y-2">
                <p className="font-semibold text-slate-800">How to enable live SAM.gov data</p>
                <ol className="list-decimal list-inside space-y-1 text-xs text-slate-600">
                  <li>Register for a free API key at <span className="font-mono bg-white px-1 rounded">api.sam.gov</span></li>
                  <li>Add to your <span className="font-mono bg-white px-1 rounded">.env.local</span>: <span className="font-mono bg-white px-1 rounded">SAMGOV_API_KEY=your_key_here</span></li>
                  <li>Restart your dev server and click &quot;Test Connection&quot; above</li>
                </ol>
                <p className="text-xs text-slate-400 mt-1">API key is free. Allow a few minutes for activation after registration.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
