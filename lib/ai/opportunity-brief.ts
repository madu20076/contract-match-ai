import type { Contract, OpportunityBrief } from '@/types'

// ── Helpers ──────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

function ensureStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

function ensureObj(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, String(val)])
  )
}

function daysUntil(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
}

function fmtMoney(n?: number) {
  if (!n) return 'TBD'
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
    : `$${(n / 1_000).toFixed(0)}K`
}

function formatContractSize(min?: number, max?: number): string {
  if (!min && !max) return 'Value TBD'
  if (min && max) return `${fmtMoney(min)} – ${fmtMoney(max)}`
  return max ? `Up to ${fmtMoney(max)}` : `From ${fmtMoney(min!)}`
}

function addDays(date: string, n: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// ── Opportunity type from NAICS ───────────────────────────────

function naicsToType(naics: string): string {
  const code = naics.slice(0, 3)
  const n    = parseInt(code, 10)
  if (n >= 541)       return 'IT & Professional Services'
  if (n >= 511 && n <= 519) return 'IT Services'
  if (n >= 611 && n <= 619) return 'Training & Education'
  if (n >= 811 && n <= 812) return 'Maintenance & Repair'
  if (n >= 561 && n <= 562) return 'Administrative Services'
  if (n >= 236 && n <= 238) return 'Construction'
  if (n >= 331 && n <= 339) return 'Manufacturing & Supplies'
  if (n >= 311 && n <= 316) return 'Food & Textiles'
  if (n >= 481 && n <= 493) return 'Transportation & Logistics'
  if (n >= 621 && n <= 629) return 'Healthcare Services'
  return 'Professional Services'
}

// ── Standard required documents by contract type + value ─────

function requiredDocuments(type: string, value: number): string[] {
  const base = ['Technical Proposal', 'Past Performance Volume', 'Price/Cost Proposal']
  if (value > 1_000_000) base.push('Representations and Certifications (SAM.gov)', 'Small Business Subcontracting Plan')
  if (type === 'Construction') base.push('SF-1442', 'Bid Bond / Performance Bond')
  if (type.includes('IT'))     base.push('System Security Plan (SSP)')
  if (type === 'Healthcare Services') base.push('Staffing Plan', 'Qualifications of Key Personnel')
  return base
}

// ── AI Prompt ─────────────────────────────────────────────────

function buildPrompt(contract: Contract): string {
  const days = daysUntil(contract.due_date)

  return `You are a government contracting intelligence system helping small businesses evaluate opportunities.

CONTRACT OPPORTUNITY
====================
Title:       ${contract.title}
Agency:      ${contract.agency}
Location:    ${contract.location}
NAICS:       ${contract.naics_codes.join(', ')}
Value Range: ${formatContractSize(contract.value_min, contract.value_max)}
Due Date:    ${contract.due_date} (${days} days)
Set-Asides:  ${contract.certifications_required.length > 0 ? contract.certifications_required.join(', ') : 'Full & Open Competition'}
Source:      ${contract.source_name ?? 'Government Portal'}
${contract.solicitation_number ? `Solicitation: ${contract.solicitation_number}` : ''}

Description:
${contract.description.slice(0, 1500)}

Return ONLY valid JSON — no markdown, no prose outside the JSON:

{
  "summary": "<2-3 sentences: what is this opportunity and why should a small business consider it>",
  "opportunity_type": "<IT Services|Professional Services|Construction|Supplies|Maintenance & Repair|Training & Education|Healthcare Services|Transportation & Logistics|Administrative Services|Research & Development|Other>",
  "estimated_contract_size": "<human-readable, e.g. '$250K–$500K' or 'Up to $2M' or '$500K'>",
  "fit_score": <0-100 — how attractive this is for eligible small businesses>,
  "win_probability": <0-100 — typical win rate for a qualified small business>,
  "proposal_complexity": <"low"|"medium"|"high"|"very_high">,
  "competition_level": <"low"|"medium"|"high">,
  "required_certifications": [<certifications required to bid, e.g. "8(a)", "SDVOSB">],
  "required_documents": [<standard submission documents, 3-6 items>],
  "key_requirements": [<3-5 specific technical or experience requirements from the description>],
  "risks": [<2-4 risks for small businesses pursuing this>],
  "recommended_actions": [<3-5 immediate actions to start pursuing this opportunity>],
  "timeline": {
    "proposal_due": "${contract.due_date}",
    "questions_deadline": "<estimated date, 2 weeks before due>",
    "award_expected": "<estimated date, 60 days after due>"
  }
}

Scoring guidance:
- fit_score: 80-100 = set-aside with small value; 60-79 = set-aside >$1M; 40-59 = full & open; 20-39 = very large / complex
- win_probability = fit_score × 0.70 for set-asides, × 0.45 for full & open
- proposal_complexity: "very_high" >$5M; "high" >$1M or many requirements; "medium" >$250K; "low" otherwise
- competition_level: "low" for sole-source/8(a); "medium" for limited set-asides; "high" for full & open`
}

// ── Parse AI response ─────────────────────────────────────────

function parseResponse(text: string, contractId: string, model: string): OpportunityBrief {
  const clean = text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(clean) as Record<string, unknown>
  } catch {
    const m = clean.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('No JSON in AI response')
    parsed = JSON.parse(m[0]) as Record<string, unknown>
  }

  const COMPLEXITIES  = ['low', 'medium', 'high', 'very_high'] as const
  const COMPETITION   = ['low', 'medium', 'high'] as const

  return {
    contract_id:             contractId,
    summary:                 String(parsed.summary ?? ''),
    opportunity_type:        String(parsed.opportunity_type ?? ''),
    estimated_contract_size: String(parsed.estimated_contract_size ?? ''),
    fit_score:               clamp(Math.round(Number(parsed.fit_score ?? 50)), 0, 100),
    win_probability:         clamp(Math.round(Number(parsed.win_probability ?? 30)), 0, 100),
    proposal_complexity:     (COMPLEXITIES.includes(parsed.proposal_complexity as 'low')
                               ? parsed.proposal_complexity : 'medium') as OpportunityBrief['proposal_complexity'],
    competition_level:       (COMPETITION.includes(parsed.competition_level as 'low')
                               ? parsed.competition_level : 'medium') as OpportunityBrief['competition_level'],
    required_certifications: ensureStrings(parsed.required_certifications),
    required_documents:      ensureStrings(parsed.required_documents),
    key_requirements:        ensureStrings(parsed.key_requirements),
    risks:                   ensureStrings(parsed.risks),
    recommended_actions:     ensureStrings(parsed.recommended_actions),
    timeline:                ensureObj(parsed.timeline),
    generated_by:            model,
  }
}

// ── Anthropic ─────────────────────────────────────────────────

async function callAnthropic(contract: Contract): Promise<OpportunityBrief> {
  const model = 'claude-sonnet-4-6'
  const res   = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: 'You are an expert government contracting analyst. Return only valid JSON.',
      messages: [{ role: 'user', content: buildPrompt(contract) }],
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
  }

  const json = await res.json() as { content?: { type: string; text: string }[] }
  const text = json.content?.find((b) => b.type === 'text')?.text ?? ''
  if (!text) throw new Error('Anthropic returned empty content')

  return parseResponse(text, contract.id, `anthropic/${model}`)
}

// ── OpenAI ────────────────────────────────────────────────────

async function callOpenAI(contract: Contract): Promise<OpportunityBrief> {
  const model = 'gpt-4o-mini'
  const res   = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${process.env.OPENAI_API_KEY!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a government contracting analyst. Return only valid JSON.' },
        { role: 'user',   content: buildPrompt(contract) },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
  }

  const json = await res.json() as { choices?: { message?: { content?: string } }[] }
  const text = json.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('OpenAI returned empty content')

  return parseResponse(text, contract.id, `openai/${model}`)
}

// ── Rule-based fallback ───────────────────────────────────────

function ruleBasedBrief(contract: Contract): OpportunityBrief {
  const days  = daysUntil(contract.due_date)
  const value = contract.value_max ?? contract.value_min ?? 0

  const naics     = contract.naics_codes[0] ?? ''
  const oppType   = naicsToType(naics)
  const hasCerts  = contract.certifications_required.length > 0
  const estSize   = formatContractSize(contract.value_min, contract.value_max)

  const proposalComplexity: OpportunityBrief['proposal_complexity'] =
    value > 5_000_000 || contract.requirements.length > 5 ? 'very_high'
    : value > 1_000_000 || contract.requirements.length > 3 ? 'high'
    : value > 250_000 ? 'medium'
    : 'low'

  const competitionLevel: OpportunityBrief['competition_level'] =
    hasCerts ? 'low' : value > 2_000_000 ? 'high' : 'medium'

  const fitBase   = hasCerts ? 72 : 48
  const fitAdj    = value > 5_000_000 ? -15 : value > 2_000_000 ? -5 : 0
  const fitScore  = clamp(fitBase + fitAdj, 20, 95)
  const winProb   = clamp(Math.round(fitScore * (hasCerts ? 0.7 : 0.45)), 0, 75)

  const reqDocs = requiredDocuments(oppType, value)

  const keyRequirements =
    contract.requirements.length > 0
      ? contract.requirements.slice(0, 5)
      : [`${oppType} experience in ${contract.agency || 'federal/state agencies'}`,
         `Performance location: ${contract.location}`,
         ...(hasCerts ? [`Must hold: ${contract.certifications_required.join(', ')}`] : [])]

  const risks: string[] = []
  if (days < 30) risks.push(`Short timeline — only ${days} days to prepare a proposal`)
  if (value > 2_000_000) risks.push('Large contract value may require bonding and strong past performance documentation')
  if (hasCerts) risks.push(`Set-aside eligibility required: ${contract.certifications_required.join(', ')}`)
  if (!hasCerts && value > 1_000_000) risks.push('Full & open competition expected — differentiation critical')
  if (risks.length === 0) risks.push('No major barriers identified — review full solicitation before committing resources')

  const qDeadline = addDays(contract.due_date, -14)
  const awardDate = addDays(contract.due_date, 60)

  const solicitationRef = contract.solicitation_number
    ? ` (${contract.solicitation_number})`
    : ''

  const summary =
    `${contract.agency} is seeking ${oppType.toLowerCase()} services for an estimated value of ${estSize}. ` +
    `The solicitation${solicitationRef} closes in ${days} days and is ${hasCerts ? 'set aside for ' + contract.certifications_required.join('/') + ' businesses' : 'open to all qualified vendors'}. ` +
    `This opportunity is rated ${fitScore >= 70 ? 'highly attractive' : fitScore >= 50 ? 'moderately attractive' : 'selectively attractive'} for eligible small businesses.`

  return {
    contract_id:             contract.id,
    summary,
    opportunity_type:        oppType,
    estimated_contract_size: estSize,
    fit_score:               fitScore,
    win_probability:         winProb,
    proposal_complexity:     proposalComplexity,
    competition_level:       competitionLevel,
    required_certifications: contract.certifications_required,
    required_documents:      reqDocs,
    key_requirements:        keyRequirements,
    risks,
    recommended_actions: [
      `Download the full solicitation from ${contract.source_url ? contract.source_url : 'the source portal'}`,
      'Review all attachments, amendments, and Q&A updates',
      hasCerts
        ? `Confirm your ${contract.certifications_required[0]} certification is active in SAM.gov`
        : 'Prepare a tailored capability statement targeting this agency',
      'Identify potential teaming partners to strengthen technical coverage',
      `Submit questions by ${qDeadline} and your proposal before ${contract.due_date}`,
    ],
    timeline: {
      proposal_due:        contract.due_date,
      questions_deadline:  qDeadline,
      award_expected:      awardDate,
    },
    generated_by: 'rule-based',
  }
}

// ── Public entry point ────────────────────────────────────────

export async function generateOpportunityBrief(contract: Contract): Promise<OpportunityBrief> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await callAnthropic(contract)
    } catch (err) {
      console.error('[generateOpportunityBrief] Anthropic failed:', err)
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      return await callOpenAI(contract)
    } catch (err) {
      console.error('[generateOpportunityBrief] OpenAI failed:', err)
    }
  }

  return ruleBasedBrief(contract)
}
