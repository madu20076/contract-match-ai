import Link from 'next/link'
import { Building2, MapPin, Clock, ChevronRight } from 'lucide-react'
import MatchScoreBadge from './MatchScoreBadge'
import type { ContractMatch } from '@/types'

// ── Source badge config ───────────────────────────────────────

const SOURCE_STYLES: Record<string, { cls: string; label: string }> = {
  'DIBBS':               { cls: 'bg-amber-100 text-amber-700',   label: 'DIBBS' },
  'SAM.gov':             { cls: 'bg-indigo-100 text-indigo-700', label: 'SAM.gov' },
  'Texas SmartBuy':      { cls: 'bg-blue-100 text-blue-700',     label: 'Texas SmartBuy' },
  'Texas ESBD':          { cls: 'bg-blue-100 text-blue-700',     label: 'Texas SmartBuy' },
  'City of Houston':               { cls: 'bg-emerald-100 text-emerald-700', label: 'Houston' },
  'City of Houston Purchasing':    { cls: 'bg-emerald-100 text-emerald-700', label: 'Houston' },
  'Harris County':                 { cls: 'bg-violet-100 text-violet-700',   label: 'Harris County' },
  'Harris County Purchasing':      { cls: 'bg-violet-100 text-violet-700',   label: 'Harris County' },
}

function SourceBadge({ name }: { name?: string }) {
  if (!name) return null
  const style = SOURCE_STYLES[name] ?? { cls: 'bg-slate-100 text-slate-600', label: name }
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${style.cls}`}>
      {style.label}
    </span>
  )
}

// ── Formatting helpers ────────────────────────────────────────

function formatCurrency(min?: number, max?: number) {
  if (!min && !max) return 'Value TBD'
  const fmt = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : `$${(n / 1_000).toFixed(0)}K`
  if (min && max) return `${fmt(min)} – ${fmt(max)}`
  if (max) return `Up to ${fmt(max)}`
  return `From ${fmt(min!)}`
}

function formatDueDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (diffDays <= 0) return { label, urgency: 'text-red-600', tag: 'Closed' }
  if (diffDays <= 14) return { label, urgency: 'text-amber-600', tag: `${diffDays}d left` }
  if (diffDays <= 30) return { label, urgency: 'text-indigo-600', tag: `${diffDays}d left` }
  return { label, urgency: 'text-slate-500', tag: `${diffDays}d left` }
}

// ── Component ─────────────────────────────────────────────────

interface ContractCardProps {
  match: ContractMatch
}

export default function ContractCard({ match }: ContractCardProps) {
  const contract = match.contract
  if (!contract) return null

  const due = formatDueDate(contract.due_date)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
              {contract.agency}
            </p>
            <SourceBadge name={contract.source_name} />
          </div>
          <h3 className="text-base font-semibold text-slate-900 leading-snug line-clamp-2">
            {contract.title}
          </h3>
        </div>
        <div className="shrink-0">
          <MatchScoreBadge score={match.match_score} size="md" />
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">
        <span className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          {contract.location}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className={due.urgency}>{due.label}</span>
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${due.urgency === 'text-red-600' ? 'bg-red-50' : due.urgency === 'text-amber-600' ? 'bg-amber-50' : 'bg-indigo-50'}`}>
            {due.tag}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          {formatCurrency(contract.value_min, contract.value_max)}
        </span>
      </div>

      {/* FSC / NSN tags (DIBBS-specific) */}
      {((contract.fsc_codes && contract.fsc_codes.length > 0) || contract.nsn) && (
        <div className="flex flex-wrap gap-1.5">
          {contract.fsc_codes?.map((fsc) => (
            <span key={fsc} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              FSC {fsc}
            </span>
          ))}
          {contract.nsn && (
            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              NSN {contract.nsn}
            </span>
          )}
        </div>
      )}

      {/* Certifications */}
      {contract.certifications_required.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {contract.certifications_required.map((cert) => (
            <span
              key={cert}
              className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium"
            >
              {cert}
            </span>
          ))}
        </div>
      )}

      {/* Why it matches */}
      <div className="bg-indigo-50 rounded-xl p-3">
        <p className="text-xs font-semibold text-indigo-700 mb-2">Why it matches</p>
        <ul className="space-y-1">
          {match.match_reasons.slice(0, 2).map((reason, i) => (
            <li key={i} className="text-xs text-indigo-800 flex items-start gap-1.5">
              <span className="mt-0.5 text-indigo-400">•</span>
              {reason}
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <Link
        href={`/contracts/${contract.id}`}
        className="mt-auto flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
      >
        View Details
        <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  )
}
