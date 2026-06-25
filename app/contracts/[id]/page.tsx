'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, MapPin, Clock, DollarSign, FileText,
  CheckSquare, Lightbulb, ExternalLink, AlertCircle, Sparkles,
  RefreshCw, CheckCircle2, AlertTriangle, XCircle, ChevronDown,
  ChevronUp, Target, TrendingUp, Shield, Zap,
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import MatchScoreBadge from '@/components/MatchScoreBadge'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { getMockContractById, getMockMatchByContractId } from '@/lib/mockData'
import type { Contract, ContractMatch, ContractAnalysis, OpportunityBrief } from '@/types'

// ── Formatters ────────────────────────────────────────────────

function formatCurrency(min?: number, max?: number) {
  if (!min && !max) return 'Value TBD'
  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
                   : `$${(n / 1_000).toFixed(0)}K`
  if (min && max) return `${fmt(min)} – ${fmt(max)}`
  return max ? `Up to ${fmt(max)}` : `From ${fmt(min!)}`
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function daysUntil(s: string) {
  return Math.ceil((new Date(s).getTime() - Date.now()) / 86_400_000)
}

// ── Section wrapper ───────────────────────────────────────────

function Section({
  icon: Icon, title, children, accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string; children: React.ReactNode; accent?: boolean
}) {
  return (
    <div className={`rounded-2xl border shadow-sm p-6 ${accent ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-4 h-4 ${accent ? 'text-indigo-500' : 'text-slate-400'}`} />
        <h3 className={`text-sm font-bold ${accent ? 'text-indigo-900' : 'text-slate-900'}`}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ── Analysis UI components ────────────────────────────────────

function ScoreBadge({ value, label, icon: Icon }: { value: number; label: string; icon: React.ComponentType<{className?: string}> }) {
  const color = value >= 70 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : value >= 40 ? 'text-amber-700 bg-amber-50 border-amber-200'
              : 'text-red-700 bg-red-50 border-red-200'
  const ring  = value >= 70 ? 'border-emerald-400'
              : value >= 40 ? 'border-amber-400'
              : 'border-red-400'
  return (
    <div className={`flex flex-col items-center gap-2 p-4 rounded-2xl border ${color}`}>
      <div className={`w-14 h-14 rounded-full border-4 ${ring} flex items-center justify-center`}>
        <span className="text-lg font-black">{value}</span>
      </div>
      <div className="flex items-center gap-1 text-xs font-semibold">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
    </div>
  )
}

const RISK_STYLE  = { low: 'bg-emerald-50 text-emerald-700 border-emerald-200', medium: 'bg-amber-50 text-amber-700 border-amber-200', high: 'bg-red-50 text-red-700 border-red-200' } as const
const EFFORT_STYLE = { low: 'bg-emerald-50 text-emerald-700 border-emerald-200', medium: 'bg-amber-50 text-amber-700 border-amber-200', high: 'bg-orange-50 text-orange-700 border-orange-200', very_high: 'bg-red-50 text-red-700 border-red-200' } as const
const EFFORT_LABEL = { low: 'Low Effort', medium: 'Medium Effort', high: 'High Effort', very_high: 'Very High Effort' } as const
const RISK_LABEL   = { low: 'Low Risk', medium: 'Medium Risk', high: 'High Risk' } as const

function PillBadge({ label, style }: { label: string; style: string }) {
  return <span className={`inline-flex items-center px-3 py-1.5 rounded-full border text-sm font-semibold ${style}`}>{label}</span>
}

function BulletList({ items, icon: Icon, color }: {
  items: string[]
  icon:  React.ComponentType<{className?: string}>
  color: string
}) {
  if (items.length === 0) return <p className="text-sm text-slate-400 italic">None identified</p>
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
          {item}
        </li>
      ))}
    </ul>
  )
}

function NumberedList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-slate-400 italic">None specified</p>
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm text-slate-700">
          <span className="shrink-0 w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold">
            {i + 1}
          </span>
          {item}
        </li>
      ))}
    </ol>
  )
}

function AnalysisPanel({
  analysis, isDemo, onRefresh, refreshing,
}: {
  analysis:  ContractAnalysis
  isDemo:    boolean
  onRefresh: () => void
  refreshing: boolean
}) {
  const [questionsOpen, setQuestionsOpen] = useState(false)

  return (
    <div className="space-y-5 mt-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-bold text-slate-900">AI Contract Analysis</h2>
          {analysis.is_ai_generated ? (
            <span className="text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-medium">
              {analysis.ai_model?.split('/')[0] === 'anthropic' ? 'Claude' : 'AI'} — Live
            </span>
          ) : (
            <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-medium">
              Rule-based
            </span>
          )}
          {isDemo && (
            <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
              Demo profile
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Re-analyze
        </button>
      </div>

      {/* Scores row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ScoreBadge value={analysis.fit_score}      label="Fit Score"        icon={Target}    />
        <ScoreBadge value={analysis.win_probability} label="Win Probability%" icon={TrendingUp} />
        <div className="flex flex-col items-center gap-2 p-4 rounded-2xl border bg-white border-slate-200">
          <Shield className="w-6 h-6 text-slate-400 mt-1" />
          <PillBadge label={RISK_LABEL[analysis.risk_level]}     style={RISK_STYLE[analysis.risk_level]}     />
        </div>
        <div className="flex flex-col items-center gap-2 p-4 rounded-2xl border bg-white border-slate-200">
          <Zap className="w-6 h-6 text-slate-400 mt-1" />
          <PillBadge label={EFFORT_LABEL[analysis.proposal_effort]} style={EFFORT_STYLE[analysis.proposal_effort]} />
        </div>
      </div>

      {/* Executive summary */}
      <div className="bg-gradient-to-r from-indigo-50 to-white border border-indigo-200 rounded-2xl p-5">
        <p className="text-sm font-semibold text-indigo-900 mb-1.5">Executive Summary</p>
        <p className="text-sm text-indigo-800 leading-relaxed">{analysis.executive_summary}</p>
      </div>

      {/* Why it matches + Risks */}
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Why It Matches
          </h3>
          <BulletList items={analysis.why_it_matches} icon={CheckCircle2} color="text-emerald-500" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Identified Risks
          </h3>
          <BulletList items={analysis.risks} icon={AlertTriangle} color="text-amber-500" />
        </div>
      </div>

      {/* Missing requirements */}
      {analysis.missing_requirements.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-red-900 mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" /> Missing Requirements
          </h3>
          <BulletList items={analysis.missing_requirements} icon={XCircle} color="text-red-500" />
        </div>
      )}

      {/* Recommended next steps */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-indigo-500" /> Recommended Next Steps
        </h3>
        <NumberedList items={analysis.recommended_next_steps} />
      </div>

      {/* Questions for CO — collapsible */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setQuestionsOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
        >
          <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            Questions for the Contracting Officer ({analysis.questions_for_contracting_officer.length})
          </span>
          {questionsOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {questionsOpen && (
          <div className="px-5 pb-5">
            <ul className="space-y-2.5">
              {analysis.questions_for_contracting_officer.map((q, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <span className="shrink-0 w-5 h-5 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">Q</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Loading shimmer ───────────────────────────────────────────

function AnalyzingState() {
  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center gap-3 text-slate-600">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
        <span className="text-sm font-medium">Analyzing opportunity…</span>
      </div>
      {/* Shimmer placeholders */}
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    </div>
  )
}

// ── Opportunity Brief section ─────────────────────────────────

const COMPLEXITY_STYLE = {
  low:       'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium:    'bg-amber-50 text-amber-700 border-amber-200',
  high:      'bg-orange-50 text-orange-700 border-orange-200',
  very_high: 'bg-red-50 text-red-700 border-red-200',
} as const

const COMPETITION_STYLE = {
  low:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high:   'bg-red-50 text-red-700 border-red-200',
} as const

const COMPLEXITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High', very_high: 'Very High' } as const
const COMPETITION_LABEL = { low: 'Low Competition', medium: 'Medium Competition', high: 'High Competition' } as const

function TagList({ items, color }: { items: string[]; color: string }) {
  if (items.length === 0) return <p className="text-xs text-slate-400 italic">None identified</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className={`text-xs font-medium px-2.5 py-1 rounded-full border ${color}`}>{item}</span>
      ))}
    </div>
  )
}

function OpportunityBriefSection({ brief }: { brief: OpportunityBrief }) {
  const isAI = !brief.generated_by.startsWith('rule')

  return (
    <div className="mt-8 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-amber-500" />
        <h2 className="text-lg font-bold text-slate-900">Opportunity Brief</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${isAI ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
          {isAI ? (brief.generated_by.startsWith('anthropic') ? 'Claude' : 'AI') : 'Rule-based'}
        </span>
        {brief.opportunity_type && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
            {brief.opportunity_type}
          </span>
        )}
      </div>

      {/* Scores + labels row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ScoreBadge value={brief.fit_score}      label="Attractiveness" icon={Target}    />
        <ScoreBadge value={brief.win_probability} label="Win Probability" icon={TrendingUp} />
        <div className="flex flex-col items-center gap-2 p-4 rounded-2xl border bg-white border-slate-200">
          <span className="text-xs text-slate-400 font-medium">Proposal</span>
          <span className={`text-xs font-bold px-2.5 py-1.5 rounded-full border ${COMPLEXITY_STYLE[brief.proposal_complexity]}`}>
            {COMPLEXITY_LABEL[brief.proposal_complexity]} Complexity
          </span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 rounded-2xl border bg-white border-slate-200">
          <span className="text-xs text-slate-400 font-medium">Competition</span>
          <span className={`text-xs font-bold px-2.5 py-1.5 rounded-full border ${COMPETITION_STYLE[brief.competition_level]}`}>
            {COMPETITION_LABEL[brief.competition_level]}
          </span>
        </div>
      </div>

      {/* Summary + Size */}
      <div className="bg-gradient-to-r from-amber-50 to-white border border-amber-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-amber-900">Brief Summary</p>
          {brief.estimated_contract_size && (
            <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full">
              {brief.estimated_contract_size}
            </span>
          )}
        </div>
        <p className="text-sm text-amber-800 leading-relaxed">{brief.summary}</p>
      </div>

      {/* Required certs + documents */}
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Required Certifications</h3>
          <TagList items={brief.required_certifications} color="bg-indigo-50 text-indigo-700 border-indigo-200" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Required Documents</h3>
          <TagList items={brief.required_documents} color="bg-slate-50 text-slate-700 border-slate-200" />
        </div>
      </div>

      {/* Key requirements + Risks */}
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Key Requirements
          </h3>
          <BulletList items={brief.key_requirements} icon={CheckCircle2} color="text-emerald-500" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Risks
          </h3>
          <BulletList items={brief.risks} icon={AlertTriangle} color="text-amber-500" />
        </div>
      </div>

      {/* Recommended actions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-indigo-500" /> Recommended Actions
        </h3>
        <NumberedList items={brief.recommended_actions} />
      </div>

      {/* Timeline */}
      {Object.keys(brief.timeline).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" /> Brief Timeline
          </h3>
          <div className="space-y-2">
            {Object.entries(brief.timeline).map(([key, val]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-slate-500 capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="font-medium text-slate-700">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

function ContractDetailContent() {
  const { id }         = useParams<{ id: string }>()
  const searchParams   = useSearchParams()

  const [contract,   setContract]   = useState<Contract | null>(null)
  const [match,      setMatch]      = useState<ContractMatch | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [analysis,   setAnalysis]   = useState<ContractAnalysis | null>(null)
  const [analyzing,  setAnalyzing]  = useState(false)
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null)
  const [isDemo,     setIsDemo]     = useState(false)
  const [brief,      setBrief]      = useState<OpportunityBrief | null>(null)

  const profileId =
    searchParams.get('profile') ??
    (typeof window !== 'undefined' ? localStorage.getItem('cmai_profile_id') : null) ??
    'demo'

  const hasProfile = !!(profileId && profileId !== 'demo')

  // Load contract + existing analysis on mount
  useEffect(() => {
    async function load() {
      setLoading(true)

      if (isSupabaseConfigured && supabase && !id.startsWith('mock-')) {
        const { data: contractData } = await supabase
          .from('contracts').select('*').eq('id', id).single()

        if (contractData) {
          setContract(contractData as Contract)

          // Load opportunity brief (auto-generated, not profile-specific)
          const briefRes = await supabase
            .from('opportunity_briefs')
            .select('*')
            .eq('contract_id', id)
            .maybeSingle()
          if (briefRes.data) setBrief(briefRes.data as OpportunityBrief)

          if (profileId && profileId !== 'demo') {
            const [matchRes, analysisRes] = await Promise.all([
              supabase.from('contract_matches').select('*')
                .eq('contract_id', id).eq('business_profile_id', profileId).maybeSingle(),
              supabase.from('contract_analyses').select('*')
                .eq('contract_id', id).eq('business_profile_id', profileId)
                .order('created_at', { ascending: false }).limit(1).maybeSingle(),
            ])
            if (matchRes.data)    setMatch(matchRes.data as ContractMatch)
            if (analysisRes.data) { setAnalysis(analysisRes.data as ContractAnalysis); setIsDemo(false) }
          }

          setLoading(false)
          return
        }
      }

      // Mock fallback
      const mc = getMockContractById(id)
      const mm = getMockMatchByContractId(id, profileId)
      setContract(mc ?? null)
      setMatch(mm ?? null)
      setLoading(false)
    }

    load()
  }, [id, profileId])

  const runAnalysis = useCallback(async (refresh = false) => {
    if (!contract) return
    setAnalyzing(true)
    setAnalyzeErr(null)

    try {
      const res  = await fetch('/api/analyze-contract', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contract_id:         contract.id,
          business_profile_id: profileId !== 'demo' ? profileId : undefined,
          refresh,
        }),
      })

      const data = await res.json() as {
        analysis?:    ContractAnalysis
        error?:       string
        is_demo?:     boolean
        profile_used?: string
      }

      if (!res.ok || data.error) {
        setAnalyzeErr(data.error ?? 'Analysis failed')
        return
      }

      if (data.analysis) {
        setAnalysis(data.analysis)
        setIsDemo(data.is_demo ?? false)
      }
    } catch (err) {
      setAnalyzeErr(err instanceof Error ? err.message : 'Network error')
    } finally {
      setAnalyzing(false)
    }
  }, [contract, profileId])

  // ── Loading / Not found ──────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-700 mb-2">Contract not found</h2>
          <p className="text-slate-500 mb-6">This contract may have been removed or the ID is incorrect.</p>
          <Link href="/dashboard"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-medium px-5 py-2.5 rounded-full text-sm hover:bg-indigo-700 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const days = daysUntil(contract.due_date)
  const urgencyColor =
    days <= 0   ? 'text-red-600 bg-red-50 border-red-200'
    : days <= 14 ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-indigo-700 bg-indigo-50 border-indigo-200'

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        {/* Contract header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-6">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-2">{contract.agency}</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight mb-4">{contract.title}</h1>
              <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400" />{contract.location}</span>
                <span className="flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-slate-400" />{formatCurrency(contract.value_min, contract.value_max)}</span>
                <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-slate-400" />NAICS: {contract.naics_codes.join(', ')}</span>
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-end gap-3">
              {match && <MatchScoreBadge score={match.match_score} size="lg" />}

              {/* Analyze button */}
              {!analysis && !analyzing && (
                <button
                  onClick={() => runAnalysis(false)}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  Analyze This Contract
                </button>
              )}
            </div>
          </div>

          {/* Deadline */}
          <div className={`mt-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${urgencyColor}`}>
            <Clock className="w-4 h-4 shrink-0" />
            <span>
              {days <= 0 ? 'Deadline has passed'
                : days === 1 ? '1 day remaining — submit today'
                : `${days} days remaining — due ${formatDate(contract.due_date)}`}
            </span>
          </div>

          {/* Certifications */}
          {contract.certifications_required.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="text-xs text-slate-400 self-center">Set-asides:</span>
              {contract.certifications_required.map(cert => (
                <span key={cert} className="text-xs bg-slate-100 text-slate-700 font-medium px-2.5 py-1 rounded-full">
                  {cert}
                </span>
              ))}
            </div>
          )}

          {contract.solicitation_number && (
            <p className="text-xs text-slate-400 mt-3">Solicitation #{contract.solicitation_number}</p>
          )}
        </div>

        {/* Main content */}
        <div className="grid sm:grid-cols-3 gap-6">
          <div className="sm:col-span-2 space-y-6">
            <Section icon={FileText} title="Contract Summary">
              <p className="text-sm text-slate-600 leading-relaxed">{contract.description}</p>
            </Section>

            {contract.requirements.length > 0 && (
              <Section icon={CheckSquare} title="Requirements">
                <ul className="space-y-2">
                  {contract.requirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <span className="mt-1 w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0" />
                      {req}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {match && match.match_reasons.length > 0 && (
              <Section icon={Lightbulb} title="Why This Matches You" accent>
                <ul className="space-y-2">
                  {match.match_reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-indigo-800">
                      <span className="mt-1 w-1.5 h-1.5 bg-indigo-400 rounded-full shrink-0" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* No profile CTA */}
            {!hasProfile && !analysis && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
                <Sparkles className="w-6 h-6 text-indigo-400 mb-3" />
                <h3 className="text-sm font-bold text-indigo-900 mb-1">Get AI Analysis</h3>
                <p className="text-xs text-indigo-700 mb-3">
                  Complete your business profile to get a personalized fit score, win probability, and proposal strategy.
                </p>
                <Link href="/onboarding"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg transition-colors">
                  Complete Onboarding →
                </Link>
              </div>
            )}

            {match && match.suggested_next_steps.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Suggested Next Steps</h3>
                <ol className="space-y-3">
                  {match.suggested_next_steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-slate-600">
                      <span className="shrink-0 w-5 h-5 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Full Solicitation</h3>
              <p className="text-xs text-slate-500 mb-4">Search by solicitation number on SAM.gov to download the full RFP.</p>
              <a href={contract.source_url ?? 'https://sam.gov'} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                {contract.source_name === 'DIBBS' ? 'Go to DIBBS' : 'Go to SAM.gov'}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Timeline</h3>
              <div className="space-y-2 text-sm">
                {contract.posted_date && (
                  <div className="flex justify-between text-slate-500">
                    <span>Posted</span>
                    <span className="font-medium text-slate-700">
                      {new Date(contract.posted_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500">
                  <span>Due Date</span>
                  <span className={`font-medium ${days <= 14 ? 'text-amber-700' : 'text-slate-700'}`}>
                    {new Date(contract.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Opportunity Brief section ── */}
        {brief && <OpportunityBriefSection brief={brief} />}

        {/* ── AI Analysis section ── */}
        <div className="mt-2">
          {/* Error */}
          {analyzeErr && (
            <div className="mt-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-red-800">Analysis failed</p>
                <p className="text-red-700 text-xs mt-0.5">{analyzeErr}</p>
                <button onClick={() => runAnalysis(true)}
                  className="text-xs text-red-600 underline mt-1 hover:text-red-800">Try again</button>
              </div>
            </div>
          )}

          {analyzing && <AnalyzingState />}

          {analysis && !analyzing && (
            <AnalysisPanel
              analysis={analysis}
              isDemo={isDemo}
              onRefresh={() => runAnalysis(true)}
              refreshing={analyzing}
            />
          )}

          {/* Trigger button below content if not analyzed yet and not analyzing */}
          {!analysis && !analyzing && !analyzeErr && (
            <div className="mt-8 flex flex-col items-center gap-3 py-12 border-2 border-dashed border-slate-200 rounded-2xl">
              <Sparkles className="w-8 h-8 text-slate-300" />
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600">Get AI-powered insights on this opportunity</p>
                <p className="text-xs text-slate-400 mt-1">Fit score · Win probability · Risk level · Proposal strategy</p>
              </div>
              <button
                onClick={() => runAnalysis(false)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm mt-1"
              >
                <Sparkles className="w-4 h-4" />
                Analyze This Contract
              </button>
              {!hasProfile && (
                <p className="text-xs text-slate-400">
                  Using demo profile.{' '}
                  <Link href="/onboarding" className="text-indigo-500 hover:underline">
                    Complete onboarding
                  </Link>{' '}
                  for personalized analysis.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ContractDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <ContractDetailContent />
    </Suspense>
  )
}
