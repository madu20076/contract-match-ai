'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { RefreshCw, AlertCircle, ChevronRight, MapPin, Clock, Building2, TrendingUp, Target, FolderOpen, Shield, Zap } from 'lucide-react'
import Navbar from '@/components/Navbar'
import ContractCard from '@/components/ContractCard'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { generateMockMatches, MOCK_CONTRACTS } from '@/lib/mockData'
import type { ContractMatch, Contract, OpportunityBrief, ProposalStrategy, ProposalWorkspace, ProposalReadiness } from '@/types'

// Evaluated once at module load — avoids calling Date.now() during render
const PAGE_LOAD_TIME = Date.now()

// ── Source badge ─────────────────────────────────────────────

const SOURCE_BADGE: Record<string, string> = {
  'DIBBS':             'bg-amber-100 text-amber-700',
  'SAM.gov':           'bg-indigo-100 text-indigo-700',
  'Texas SmartBuy':    'bg-blue-100 text-blue-700',
  'City of Houston':   'bg-emerald-100 text-emerald-700',
  'Harris County':     'bg-violet-100 text-violet-700',
}

function SourceBadge({ name }: { name?: string }) {
  if (!name) return null
  const cls = SOURCE_BADGE[name] ?? 'bg-slate-100 text-slate-600'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{name}</span>
}

// ── DIBBS opportunity card ────────────────────────────────────

function DibbsCard({ contract }: { contract: Contract }) {
  const due   = new Date(contract.due_date)
  const now   = PAGE_LOAD_TIME
  const days  = Math.ceil((due.getTime() - now) / 86_400_000)
  const urgent = days <= 14

  return (
    <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">DIBBS</span>
            {contract.solicitation_type && (
              <span className="text-xs text-slate-400">{contract.solicitation_type}</span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 leading-snug">
            {contract.title}
          </h3>
        </div>
      </div>

      {/* NSN / FSC tags */}
      <div className="flex flex-wrap gap-1.5">
        {contract.nsn && (
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-mono font-medium">
            NSN {contract.nsn}
          </span>
        )}
        {contract.fsc_codes?.map((fsc) => (
          <span key={fsc} className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded font-mono">
            FSC {fsc}
          </span>
        ))}
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {contract.agency}</span>
        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {contract.location}</span>
        <span className={`flex items-center gap-1 font-medium ${urgent ? 'text-amber-600' : 'text-slate-500'}`}>
          <Clock className="w-3 h-3" />
          {days <= 0 ? 'Closed' : `${days}d left`}
        </span>
      </div>

      <Link
        href={`/contracts/${contract.id}`}
        className="mt-auto flex items-center justify-center gap-1 text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 py-2 rounded-xl transition-colors"
      >
        View Solicitation <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}

// ── Recent opportunity row ────────────────────────────────────

function RecentRow({ contract }: { contract: Contract }) {
  const due  = new Date(contract.due_date)
  const now  = PAGE_LOAD_TIME
  const days = Math.ceil((due.getTime() - now) / 86_400_000)

  function fmtValue(min?: number, max?: number) {
    if (!min && !max) return null
    const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`
    return max ? fmt(max) : fmt(min!)
  }

  return (
    <Link
      href={`/contracts/${contract.id}`}
      className="flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
          {contract.title}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{contract.agency}</span>
          <SourceBadge name={contract.source_name} />
        </p>
      </div>
      <div className="shrink-0 text-right">
        {fmtValue(contract.value_min, contract.value_max) && (
          <p className="text-xs font-medium text-slate-700">{fmtValue(contract.value_min, contract.value_max)}</p>
        )}
        <p className={`text-xs ${days <= 14 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
          {days <= 0 ? 'Closed' : `${days}d left`}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" />
    </Link>
  )
}

// ── Section wrapper ───────────────────────────────────────────

function Section({
  title, subtitle, count, href, hrefLabel, children,
}: {
  title: string
  subtitle?: string
  count?: number
  href?: string
  hrefLabel?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {count !== undefined && (
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
          {href && (
            <Link href={href} className="text-sm text-indigo-600 hover:underline font-medium">
              {hrefLabel ?? 'View all'}
            </Link>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Best Opportunity Card ─────────────────────────────────────

interface BriefWithContract extends OpportunityBrief {
  contract: Contract | null
}

function BestOpportunityCard({ item }: { item: BriefWithContract }) {
  const c   = item.contract
  const now = PAGE_LOAD_TIME
  if (!c) return null
  const days = Math.ceil((new Date(c.due_date).getTime() - now) / 86_400_000)
  const score = Math.round((item.fit_score * item.win_probability) / 100)

  const scoreColor = score >= 50 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                   : score >= 30 ? 'text-amber-700 bg-amber-50 border-amber-200'
                   : 'text-slate-600 bg-slate-50 border-slate-200'

  return (
    <Link
      href={`/contracts/${c.id}`}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md hover:border-indigo-200 transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">{c.agency}</p>
          <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 group-hover:text-indigo-700 transition-colors">
            {c.title}
          </h3>
        </div>
        <div className={`shrink-0 flex flex-col items-center rounded-xl border px-3 py-2 ${scoreColor}`}>
          <span className="text-lg font-black leading-none">{score}</span>
          <span className="text-[9px] font-bold uppercase tracking-wide mt-0.5">Score</span>
        </div>
      </div>

      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{item.summary}</p>

      <div className="flex items-center gap-3 text-xs">
        <span className="flex items-center gap-1 text-slate-500">
          <Target className="w-3 h-3" /> {item.fit_score}% fit
        </span>
        <span className="flex items-center gap-1 text-slate-500">
          <TrendingUp className="w-3 h-3" /> {item.win_probability}% win
        </span>
        <span className={`flex items-center gap-1 font-medium ml-auto ${days <= 14 ? 'text-amber-600' : 'text-slate-400'}`}>
          <Clock className="w-3 h-3" />
          {days <= 0 ? 'Closed' : `${days}d left`}
        </span>
      </div>
    </Link>
  )
}

// ── Active workspace row (module scope) ───────────────────────

type WorkspaceWithContract = Omit<ProposalWorkspace, 'contract'> & { contract: Contract | null }

const RISK_DOT: Record<string, string> = {
  low:      'bg-emerald-500',
  medium:   'bg-amber-400',
  high:     'bg-red-400',
  critical: 'bg-red-600',
}

function ActiveWorkspaceRow({
  item, profileId, readiness,
}: {
  item:      WorkspaceWithContract
  profileId: string
  readiness: ProposalReadiness | null
}) {
  const c   = item.contract
  const now = PAGE_LOAD_TIME
  if (!c) return null
  const days = Math.ceil((new Date(c.due_date).getTime() - now) / 86_400_000)

  return (
    <Link
      href={`/workspace/${c.id}?profile=${profileId}`}
      className="flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 transition-colors group"
    >
      <div className="shrink-0 w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center">
        <FolderOpen className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
          {c.title}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
          <span>{c.agency}</span>
          <SourceBadge name={c.source_name} />
        </p>
      </div>
      <div className="shrink-0 text-right">
        {readiness && (
          <div className="flex items-center gap-1.5 justify-end mb-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${RISK_DOT[readiness.risk_level] ?? 'bg-slate-300'}`} />
            <span className="text-xs font-bold text-slate-700">{readiness.overall_score}%</span>
            <span className="text-[10px] text-slate-400">ready</span>
          </div>
        )}
        <p className={`text-xs ${days <= 14 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
          {days <= 0 ? 'Closed' : `${days}d left`}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" />
    </Link>
  )
}

// ── Proposal Readiness widget ─────────────────────────────────

function ReadinessGaugeSmall({ score }: { score: number; riskLevel?: string }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div className="relative w-10 h-10 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="15" fill="none" stroke="#e2e8f0" strokeWidth="5" />
        <circle cx="20" cy="20" r="15" fill="none"
          stroke={color} strokeWidth="5"
          strokeDasharray={`${2 * Math.PI * 15}`}
          strokeDashoffset={`${2 * Math.PI * 15 * (1 - score / 100)}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-slate-900">
        {score}
      </span>
    </div>
  )
}

function ReadinessRow({
  item, readiness, profileId,
}: {
  item:      WorkspaceWithContract
  readiness: ProposalReadiness
  profileId: string
}) {
  const c   = item.contract
  const now = PAGE_LOAD_TIME
  if (!c) return null
  const days = Math.ceil((new Date(c.due_date).getTime() - now) / 86_400_000)

  return (
    <Link
      href={`/workspace/${c.id}?profile=${profileId}#rfp`}
      className="flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 transition-colors group"
    >
      <ReadinessGaugeSmall score={readiness.overall_score} riskLevel={readiness.risk_level} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
          {c.title}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {readiness.action_items[0] ?? `${readiness.risk_level} risk`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-xs ${days <= 14 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
          {days <= 0 ? 'Closed' : `${days}d left`}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" />
    </Link>
  )
}

// ── Strategy row (module scope) ───────────────────────────────

interface StrategyWithContract extends ProposalStrategy {
  contract: Contract | null
}

const REC_STYLE = {
  GO:          'bg-emerald-50 text-emerald-700 border-emerald-200',
  'NO-GO':     'bg-red-50 text-red-700 border-red-200',
  CONDITIONAL: 'bg-amber-50 text-amber-700 border-amber-200',
} as const

function StrategyRow({ item }: { item: StrategyWithContract }) {
  const c   = item.contract
  const now = PAGE_LOAD_TIME
  if (!c) return null
  const days = Math.ceil((new Date(c.due_date).getTime() - now) / 86_400_000)

  return (
    <Link
      href={`/contracts/${c.id}`}
      className="flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 transition-colors group"
    >
      <div className={`shrink-0 flex flex-col items-center rounded-xl border px-2.5 py-1.5 text-center ${REC_STYLE[item.recommendation]}`}>
        <span className="text-base font-black leading-none">{item.confidence_score}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide">{item.recommendation}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
          {c.title}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
          <span>{c.agency}</span>
          <SourceBadge name={c.source_name} />
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-xs ${days <= 14 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
          {days <= 0 ? 'Closed' : `${days}d left`}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" />
    </Link>
  )
}

// ── Dashboard content ─────────────────────────────────────────

function DashboardContent() {
  const searchParams = useSearchParams()

  const [topMatches,      setTopMatches]      = useState<ContractMatch[]>([])
  const [dibbsContracts,  setDibbsContracts]  = useState<Contract[]>([])
  const [recentContracts, setRecentContracts] = useState<Contract[]>([])
  const [bestBriefs,      setBestBriefs]      = useState<BriefWithContract[]>([])
  const [bestStrategies,    setBestStrategies]    = useState<StrategyWithContract[]>([])
  const [activeWorkspaces,  setActiveWorkspaces]  = useState<WorkspaceWithContract[]>([])
  const [readinessScores,   setReadinessScores]   = useState<ProposalReadiness[]>([])
  const [loading,         setLoading]         = useState(true)
  const [dataSource,      setDataSource]      = useState<'supabase' | 'mock'>('mock')

  const profileId =
    searchParams.get('profile') ??
    (typeof window !== 'undefined' ? localStorage.getItem('cmai_profile_id') : null) ??
    'demo'

  const isDemo = !profileId || profileId.startsWith('mock-') || profileId === 'demo'

  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false

    if (isSupabaseConfigured && supabase && !isDemo) {
      Promise.all([
        supabase
          .from('contract_matches')
          .select('*, contract:contracts(*)')
          .eq('business_profile_id', profileId)
          .order('match_score', { ascending: false })
          .limit(6),
        supabase
          .from('contracts')
          .select('*')
          .eq('source_name', 'DIBBS')
          .gte('due_date', new Date().toISOString().split('T')[0])
          .order('due_date', { ascending: true })
          .limit(4),
        supabase
          .from('contracts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('opportunity_briefs')
          .select('*, contract:contracts(*)')
          .order('fit_score', { ascending: false })
          .limit(5),
        supabase
          .from('proposal_strategies')
          .select('*, contract:contracts(*)')
          .eq('business_profile_id', profileId)
          .order('confidence_score', { ascending: false })
          .limit(6),
        supabase
          .from('proposal_workspaces')
          .select('*, contract:contracts(*)')
          .eq('business_profile_id', profileId)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(5),
        supabase
          .from('proposal_readiness')
          .select('*')
          .order('overall_score', { ascending: false })
          .limit(10),
      ]).then(([matchesRes, dibbsRes, recentRes, briefsRes, strategiesRes, workspacesRes, readinessRes]) => {
        if (cancelled) return
        if (!matchesRes.error && (matchesRes.data?.length ?? 0) > 0) {
          setTopMatches(matchesRes.data as unknown as ContractMatch[])
          setDibbsContracts((dibbsRes.data ?? []) as unknown as Contract[])
          setRecentContracts((recentRes.data ?? []) as unknown as Contract[])
          setBestBriefs((briefsRes.data ?? []) as unknown as BriefWithContract[])
          setBestStrategies((strategiesRes.data ?? []) as unknown as StrategyWithContract[])
          setActiveWorkspaces((workspacesRes.data ?? []) as unknown as WorkspaceWithContract[])
          setReadinessScores((readinessRes?.data ?? []) as unknown as ProposalReadiness[])
          setDataSource('supabase')
          setLoading(false)
          return
        }
        // Fall through to mock if no matches
        const mockMatches = generateMockMatches(profileId)
        setTopMatches(mockMatches)
        setDibbsContracts(MOCK_CONTRACTS.filter((c) => c.source_name === 'DIBBS'))
        setRecentContracts(MOCK_CONTRACTS.filter((c) => c.source_name !== 'DIBBS').slice(0, 6))
        setDataSource('mock')
        setLoading(false)
      })
    } else {
      // Async boundary so setState calls are in .then() — not synchronous in effect
      Promise.resolve().then(() => {
        if (cancelled) return
        setTopMatches(generateMockMatches(profileId))
        setDibbsContracts(MOCK_CONTRACTS.filter((c) => c.source_name === 'DIBBS'))
        setRecentContracts(MOCK_CONTRACTS.filter((c) => c.source_name !== 'DIBBS').slice(0, 6))
        setDataSource('mock')
        setLoading(false)
      })
    }

    return () => { cancelled = true }
  }, [profileId, isDemo, tick])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Contract Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">
            {dataSource === 'mock' ? (
              <>Demo data — <Link href="/onboarding" className="text-indigo-600 hover:underline">create your profile</Link> for personalized matches.</>
            ) : (
              `Live matches from your business profile`
            )}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); setTick(t => t + 1) }}
          disabled={loading}
          className="flex items-center gap-1.5 self-start text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-600 hover:text-slate-900 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <p className="text-sm">Loading your matches…</p>
        </div>
      ) : (
        <>
          {/* ── Section 1: Recommended Matches ── */}
          <Section
            title="Recommended Matches"
            subtitle="Scored by NAICS, FSC, certifications, and experience"
            count={topMatches.length}
            href="/onboarding"
            hrefLabel={dataSource === 'mock' ? 'Build profile →' : undefined}
          >
            {topMatches.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                <p className="text-slate-500 text-sm">No matches yet. <Link href="/onboarding" className="text-indigo-600 hover:underline">Create your profile</Link> to get started.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {topMatches.map((match) => (
                  <ContractCard key={match.id} match={match} />
                ))}
              </div>
            )}
          </Section>

          {/* ── Section 1b: Today's Best Opportunities (from AI briefs) ── */}
          {bestBriefs.length > 0 && (
            <Section
              title="Today's Best Opportunities"
              subtitle="Ranked by AI attractiveness × win probability"
              count={bestBriefs.length}
              href="/admin/ai"
              hrefLabel="View brief queue →"
            >
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {bestBriefs
                  .sort((a, b) =>
                    (b.fit_score * b.win_probability) - (a.fit_score * a.win_probability)
                  )
                  .slice(0, 5)
                  .map((item) => (
                    <BestOpportunityCard key={item.id ?? item.contract_id} item={item} />
                  ))}
              </div>
            </Section>
          )}

          {/* ── Section 1c: My Best Opportunities (from strategy scores) ── */}
          {!isDemo && bestStrategies.length > 0 && (
            <Section
              title="My Best Opportunities"
              subtitle="Ranked by your personalized GO/NO-GO strategy confidence score"
              count={bestStrategies.length}
            >
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                {bestStrategies.map((item) => (
                  <StrategyRow key={item.id ?? item.contract_id} item={item} />
                ))}
              </div>
            </Section>
          )}

          {/* ── Section 1d: My Active Proposals (workspaces) ── */}
          {!isDemo && activeWorkspaces.length > 0 && (
            <Section
              title="My Active Proposals"
              subtitle="Contracts where you have an open proposal workspace"
              count={activeWorkspaces.length}
            >
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                {activeWorkspaces.map((item) => {
                  const readiness = readinessScores.find(r => r.workspace_id === item.id) ?? null
                  return (
                    <ActiveWorkspaceRow key={item.id} item={item} profileId={profileId} readiness={readiness} />
                  )
                })}
              </div>
            </Section>
          )}

          {/* ── Section 1e: Proposal Readiness ── */}
          {!isDemo && readinessScores.length > 0 && (() => {
            const readinessWithWorkspace = readinessScores
              .map(r => ({ readiness: r, workspace: activeWorkspaces.find(w => w.id === r.workspace_id) }))
              .filter(({ workspace }) => workspace != null) as Array<{ readiness: ProposalReadiness; workspace: WorkspaceWithContract }>
            if (readinessWithWorkspace.length === 0) return null
            return (
              <Section
                title="Proposal Readiness"
                subtitle="RFP compliance and preparation status across active proposals"
              >
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                  <div className="flex items-center gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100">
                    <Zap className="w-4 h-4 text-indigo-500 shrink-0" />
                    <div className="flex items-center gap-6 text-xs text-slate-500">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Low risk (80+%)</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> Medium (60–79%)</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> High risk (&lt;60%)</span>
                    </div>
                    <Link href="/workspace" className="ml-auto text-xs text-indigo-600 hover:underline flex items-center gap-1">
                      <Shield className="w-3 h-3" /> Upload RFP →
                    </Link>
                  </div>
                  {readinessWithWorkspace.map(({ readiness, workspace }) => (
                    <ReadinessRow
                      key={readiness.id}
                      item={workspace}
                      readiness={readiness}
                      profileId={profileId}
                    />
                  ))}
                </div>
              </Section>
            )
          })()}

          {/* ── Section 2: DIBBS Opportunities ── */}
          {dibbsContracts.length > 0 && (
            <Section
              title="DIBBS Opportunities"
              subtitle="Defense supply solicitations — NSN and FSC indexed"
              count={dibbsContracts.length}
            >
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {dibbsContracts.map((contract) => (
                  <DibbsCard key={contract.id} contract={contract} />
                ))}
              </div>
            </Section>
          )}

          {/* ── Section 3: New Opportunities ── */}
          {recentContracts.length > 0 && (
            <Section
              title="New Opportunities Today"
              subtitle="Recently added across all sources"
              count={recentContracts.length}
            >
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                {recentContracts.map((contract) => (
                  <RecentRow key={contract.id} contract={contract} />
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Demo notice */}
      {!loading && dataSource === 'mock' && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Demo mode:</strong>{' '}
            {isSupabaseConfigured
              ? 'Connect a business profile to see AI-matched contracts.'
              : 'Add Supabase credentials in .env.local to enable live matching.'}
            {' '}<Link href="/onboarding" className="underline font-medium">Get started →</Link>
          </span>
        </div>
      )}
    </div>
  )
}

function DashboardFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-400">
      <RefreshCw className="w-8 h-8 animate-spin" />
      <p className="text-sm">Loading dashboard…</p>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Suspense fallback={<DashboardFallback />}>
        <DashboardContent />
      </Suspense>
    </div>
  )
}
