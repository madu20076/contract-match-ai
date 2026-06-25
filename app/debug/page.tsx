'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, XCircle, RefreshCw, ArrowLeft, Database } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

interface HealthData {
  connected: boolean
  profiles: number | null
  contracts: number | null
  matches: number | null
  error?: string
  checkedAt: string
}

async function fetchHealth(): Promise<HealthData> {
  const checkedAt = new Date().toLocaleTimeString()

  if (!isSupabaseConfigured || !supabase) {
    return { connected: false, profiles: null, contracts: null, matches: null, checkedAt }
  }

  try {
    const [profilesRes, contractsRes, matchesRes] = await Promise.all([
      supabase.from('business_profiles').select('*', { count: 'exact', head: true }),
      supabase.from('contracts').select('*', { count: 'exact', head: true }),
      supabase.from('contract_matches').select('*', { count: 'exact', head: true }),
    ])

    if (profilesRes.error) throw profilesRes.error
    if (contractsRes.error) throw contractsRes.error
    if (matchesRes.error) throw matchesRes.error

    return {
      connected: true,
      profiles: profilesRes.count ?? 0,
      contracts: contractsRes.count ?? 0,
      matches: matchesRes.count ?? 0,
      checkedAt,
    }
  } catch (err) {
    return {
      connected: false,
      profiles: null,
      contracts: null,
      matches: null,
      error: err instanceof Error ? err.message : 'Unknown error',
      checkedAt,
    }
  }
}

function StatusRow({
  label,
  value,
  ok,
  hint,
}: {
  label: string
  value: string
  ok: boolean
  hint?: string
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
        )}
        <span
          className={`text-sm font-semibold ${ok ? 'text-emerald-700' : 'text-red-600'}`}
        >
          {value}
        </span>
      </div>
    </div>
  )
}

function CountRow({ label, count, hint }: { label: string; count: number | null; hint?: string }) {
  const hasData = count !== null && count > 0
  return (
    <div className="flex items-center justify-between py-4 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
      <span
        className={`text-sm font-semibold ${
          count === null ? 'text-slate-400' : hasData ? 'text-indigo-600' : 'text-amber-600'
        }`}
      >
        {count === null ? '—' : count.toLocaleString()}
      </span>
    </div>
  )
}

export default function DebugPage() {
  const [health,  setHealth]  = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick,    setTick]    = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchHealth().then((result) => {
      if (cancelled) return
      setHealth(result)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [tick])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold text-slate-900">System Health</span>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Contract Match AI — Debug</h1>
            {health && (
              <p className="text-xs text-slate-400 mt-1">Last checked at {health.checkedAt}</p>
            )}
          </div>
          <button
            onClick={() => { setLoading(true); setTick(t => t + 1) }}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Recheck
          </button>
        </div>

        {/* Loading */}
        {loading && !health && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center gap-3 text-slate-400">
            <RefreshCw className="w-7 h-7 animate-spin" />
            <p className="text-sm">Checking connection…</p>
          </div>
        )}

        {/* Results */}
        {health && (
          <>
            {/* Connection card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Connection
              </h2>
              <StatusRow
                label="Supabase configured"
                value={isSupabaseConfigured ? 'Yes' : 'No'}
                ok={isSupabaseConfigured}
                hint={
                  isSupabaseConfigured
                    ? 'NEXT_PUBLIC_SUPABASE_URL and ANON_KEY are set'
                    : 'Add credentials to .env.local — see docs/supabase_setup.md'
                }
              />
              <StatusRow
                label="Supabase connected"
                value={health.connected ? 'Yes' : 'No'}
                ok={health.connected}
                hint={
                  health.connected
                    ? 'Successfully reached the database'
                    : health.error ?? 'Could not connect — check your credentials'
                }
              />
            </div>

            {/* Counts card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Row Counts
              </h2>
              <CountRow
                label="Business profiles"
                count={health.profiles}
                hint="Submitted via /onboarding"
              />
              <CountRow
                label="Contracts"
                count={health.contracts}
                hint="Run the seed SQL in docs/supabase_schema.sql to populate"
              />
              <CountRow
                label="Contract matches"
                count={health.matches}
                hint="Call generate_matches_for_profile() after seeding contracts"
              />
            </div>

            {/* Error detail */}
            {health.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                <p className="font-semibold mb-1">Connection error</p>
                <p className="font-mono text-xs break-all">{health.error}</p>
              </div>
            )}

            {/* Next steps */}
            {!health.connected && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 text-sm">
                <p className="font-semibold text-indigo-900 mb-3">Next steps</p>
                <ol className="space-y-2 text-indigo-800">
                  {[
                    'Create a free project at supabase.com',
                    'Copy credentials from Settings → API',
                    'Add them to .env.local (see .env.local.example)',
                    'Run the SQL in docs/supabase_schema.sql',
                    'Restart npm run dev and recheck this page',
                  ].map((step, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="shrink-0 w-5 h-5 bg-indigo-200 text-indigo-800 rounded-full flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
                <Link
                  href="/docs/supabase_setup.md"
                  className="inline-block mt-4 text-indigo-600 font-medium text-xs underline underline-offset-2"
                >
                  Read the full setup guide →
                </Link>
              </div>
            )}

            {/* All green */}
            {health.connected && (health.contracts ?? 0) > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-sm text-emerald-800">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
                <span>
                  Everything looks good.{' '}
                  <Link href="/onboarding" className="font-semibold underline underline-offset-2">
                    Submit a profile
                  </Link>{' '}
                  to generate your first matches.
                </span>
              </div>
            )}

            {health.connected && (health.contracts ?? 0) === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-sm text-amber-800">
                <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
                <span>
                  Connected but <strong>no contracts found</strong>. Run the seed SQL at the bottom
                  of <code className="text-xs bg-amber-100 px-1 rounded">docs/supabase_schema.sql</code> in
                  the Supabase SQL Editor.
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
