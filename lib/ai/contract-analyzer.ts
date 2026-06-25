import type { Contract, BusinessProfile, ContractAnalysis } from '@/types'

// ── Helpers ──────────────────────────────────────────────────

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function ensureStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
}

function fmtCurrency(n?: number) {
  if (!n) return 'TBD'
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`
}

// ── AI prompt ────────────────────────────────────────────────

function buildPrompt(contract: Contract, profile: BusinessProfile): string {
  const days = daysUntil(contract.due_date)
  const value = `${fmtCurrency(contract.value_min)} – ${fmtCurrency(contract.value_max)}`

  return `You are a senior government contracting consultant helping a small business decide whether to pursue a federal contract opportunity. Analyze the opportunity carefully and return a JSON object ONLY — no markdown, no explanation outside the JSON.

CONTRACT OPPORTUNITY
====================
Title:       ${contract.title}
Agency:      ${contract.agency}
Location:    ${contract.location}
NAICS Codes: ${contract.naics_codes.join(', ')}
Value Range: ${value}
Due Date:    ${contract.due_date} (${days} days away)
Set-Asides:  ${contract.certifications_required.length > 0 ? contract.certifications_required.join(', ') : 'None / Full and Open'}
Source:      ${contract.source_name ?? 'Federal'}
${contract.solicitation_number ? `Solicitation: ${contract.solicitation_number}` : ''}

Description:
${contract.description}

Requirements:
${contract.requirements.map(r => `- ${r}`).join('\n') || '- See full solicitation for details'}

SMALL BUSINESS PROFILE
======================
Name:                    ${profile.business_name}
Industry:                ${profile.industry}
NAICS Codes:             ${profile.naics_codes.join(', ')}
Certifications:          ${profile.certifications.length > 0 ? profile.certifications.join(', ') : 'None'}
State:                   ${profile.state}
Years in Business:       ${profile.years_in_business}
Gov't Experience:        ${profile.past_government_experience ? 'Yes' : 'No'}
Keywords / Capabilities: ${(profile.keywords ?? []).join(', ') || 'Not specified'}
${(profile.fsc_codes ?? []).length > 0 ? `FSC Codes: ${profile.fsc_codes.join(', ')}` : ''}

INSTRUCTIONS
============
Produce a thorough, actionable analysis. Be specific — reference actual contract requirements and profile data.
Return exactly this JSON structure (all fields required):

{
  "fit_score": <integer 0-100>,
  "win_probability": <integer 0-100>,
  "risk_level": <"low" | "medium" | "high">,
  "proposal_effort": <"low" | "medium" | "high" | "very_high">,
  "executive_summary": "<2-3 sentences summarising whether this is worth pursuing and why>",
  "why_it_matches": ["<specific reason 1>", "<specific reason 2>", ...],
  "risks": ["<specific risk 1>", "<specific risk 2>", ...],
  "missing_requirements": ["<gap 1>", "<gap 2>", ...],
  "recommended_next_steps": ["<action 1>", "<action 2>", ...],
  "questions_for_contracting_officer": ["<question 1>", "<question 2>", ...]
}

Scoring guidance:
- fit_score: NAICS match (40 pts), certifications (30 pts), location/state (10 pts), experience (10 pts), capabilities (10 pts)
- win_probability: fit_score × 0.6, adjusted for competition, set-aside eligibility, and days remaining
- risk_level: "high" if any required cert is missing or < 21 days; "medium" if < 45 days or value > $2M; otherwise "low"
- proposal_effort: "very_high" if value > $5M or > 5 requirements; "high" if > $1M or > 3 requirements; "medium" if > $250K; "low" otherwise
- Aim for 3-5 items in each array field`
}

// ── Parse + validate AI JSON ─────────────────────────────────

function parseAIResponse(
  text: string,
  contractId: string,
  profileId?: string,
  model?: string,
): ContractAnalysis {
  // Strip markdown code fences
  const clean = text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(clean) as Record<string, unknown>
  } catch {
    // Try to extract JSON substring
    const jsonMatch = clean.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON object found in AI response')
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
  }

  const RISK_LEVELS  = ['low', 'medium', 'high'] as const
  const EFFORT_LEVELS = ['low', 'medium', 'high', 'very_high'] as const

  return {
    contract_id:                       contractId,
    business_profile_id:               profileId,
    fit_score:                         clamp(Math.round(Number(parsed.fit_score ?? 0)),  0, 100),
    win_probability:                   clamp(Math.round(Number(parsed.win_probability ?? 0)), 0, 100),
    risk_level:                        (RISK_LEVELS.includes(parsed.risk_level as 'low') ? parsed.risk_level  : 'medium') as ContractAnalysis['risk_level'],
    proposal_effort:                   (EFFORT_LEVELS.includes(parsed.proposal_effort as 'low') ? parsed.proposal_effort : 'medium') as ContractAnalysis['proposal_effort'],
    executive_summary:                 String(parsed.executive_summary ?? ''),
    why_it_matches:                    ensureStringArray(parsed.why_it_matches),
    risks:                             ensureStringArray(parsed.risks),
    missing_requirements:              ensureStringArray(parsed.missing_requirements),
    recommended_next_steps:            ensureStringArray(parsed.recommended_next_steps),
    questions_for_contracting_officer: ensureStringArray(parsed.questions_for_contracting_officer),
    ai_model:                          model,
    is_ai_generated:                   true,
  }
}

// ── Anthropic ────────────────────────────────────────────────

async function callAnthropic(
  contract: Contract,
  profile: BusinessProfile,
): Promise<ContractAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY!
  const model  = 'claude-sonnet-4-6'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: 'You are an expert government contracting consultant. Return only valid JSON — no prose outside the JSON object.',
      messages: [{ role: 'user', content: buildPrompt(contract, profile) }],
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`)
  }

  const json = await res.json() as { content?: { type: string; text: string }[] }
  const text = json.content?.find(b => b.type === 'text')?.text ?? ''
  if (!text) throw new Error('Anthropic returned empty content')

  return parseAIResponse(text, contract.id, profile.id, `anthropic/${model}`)
}

// ── OpenAI ───────────────────────────────────────────────────

async function callOpenAI(
  contract: Contract,
  profile: BusinessProfile,
): Promise<ContractAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY!
  const model  = 'gpt-4o-mini'

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role:    'system',
          content: 'You are an expert government contracting consultant. Return only valid JSON.',
        },
        { role: 'user', content: buildPrompt(contract, profile) },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 300)}`)
  }

  const json = await res.json() as { choices?: { message?: { content?: string } }[] }
  const text = json.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('OpenAI returned empty content')

  return parseAIResponse(text, contract.id, profile.id, `openai/${model}`)
}

// ── Rule-based fallback ──────────────────────────────────────

function ruleBasedAnalysis(
  contract: Contract,
  profile: BusinessProfile,
): ContractAnalysis {
  // --- Scoring ---
  const naicsOverlap = profile.naics_codes.filter(n =>
    contract.naics_codes.some(c =>
      c.slice(0, 3) === n.slice(0, 3)   // 3-digit subsector match
    )
  ).length
  const naicsScore = Math.min(40, naicsOverlap * 20)

  const requiredCerts   = contract.certifications_required
  const profileCerts    = profile.certifications
  const matchedCerts    = requiredCerts.filter(c => profileCerts.includes(c))
  const missingCerts    = requiredCerts.filter(c => !profileCerts.includes(c))
  const certScore =
    requiredCerts.length === 0  ? 20                              // open competition
    : matchedCerts.length > 0   ? Math.min(30, matchedCerts.length * 15)
    : 0                                                           // missing required cert

  const stateScore  = profile.state === contract.state ? 10 : 5
  const expScore    = profile.past_government_experience ? 10 : 3
  const keywords    = profile.keywords ?? []
  const desc        = (contract.description + ' ' + contract.requirements.join(' ')).toLowerCase()
  const kwScore     = Math.min(10, keywords.filter(k => desc.includes(k.toLowerCase())).length * 3)

  const fitScore      = clamp(naicsScore + certScore + stateScore + expScore + kwScore, 0, 100)
  const winProbability = clamp(Math.round(fitScore * 0.65 - (missingCerts.length > 0 ? 20 : 0)), 0, 65)

  // --- Risk ---
  const days  = daysUntil(contract.due_date)
  const value = contract.value_max ?? contract.value_min ?? 0
  const riskLevel: ContractAnalysis['risk_level'] =
    missingCerts.length > 0 || days < 21 ? 'high'
    : value > 2_000_000 || days < 45     ? 'medium'
    : 'low'

  // --- Effort ---
  const reqCount = contract.requirements.length
  const proposalEffort: ContractAnalysis['proposal_effort'] =
    value > 5_000_000 || reqCount > 5 ? 'very_high'
    : value > 1_000_000 || reqCount > 3 ? 'high'
    : value > 250_000  || reqCount > 1  ? 'medium'
    : 'low'

  // --- Text ---
  const why_it_matches: string[] = []
  if (naicsOverlap > 0)
    why_it_matches.push(`NAICS ${contract.naics_codes[0]} aligns with your ${profile.industry} focus`)
  if (matchedCerts.length > 0)
    why_it_matches.push(`Your ${matchedCerts.join(' / ')} certification qualifies you for this set-aside`)
  if (profile.past_government_experience)
    why_it_matches.push('Past government contracting experience strengthens your past performance section')
  if (stateScore === 10)
    why_it_matches.push(`Contract is located in ${contract.state}, within your service area`)
  if (kwScore > 0)
    why_it_matches.push('Your capability keywords match the scope of work')
  if (why_it_matches.length === 0)
    why_it_matches.push('Review the full solicitation to identify specific alignment with your capabilities')

  const risks: string[] = []
  if (days < 30)   risks.push(`Proposal deadline is ${days} days away — limited preparation time`)
  if (missingCerts.length > 0)
    risks.push(`Missing required certification(s): ${missingCerts.join(', ')}`)
  if (value > 2_000_000)
    risks.push('Large contract value may require bonding or financial capacity documentation')
  if (reqCount > 4)
    risks.push('Multiple technical requirements may require a teaming partner')
  if (!profile.past_government_experience)
    risks.push('Limited government experience may reduce competitiveness against incumbents')
  if (risks.length === 0)
    risks.push('No major risk factors identified — verify by reading the full solicitation')

  const missing_requirements = [
    ...missingCerts.map(c => `${c} certification required but not held`),
    ...contract.requirements.slice(3, 6).map(r => r.slice(0, 80)),
  ].slice(0, 4)

  const recommended_next_steps = [
    `Download the full RFP from SAM.gov${contract.solicitation_number ? ` (Solicitation #${contract.solicitation_number})` : ''}`,
    'Review all attachments, amendments, and Q&A documents',
    missingCerts.length > 0
      ? `Address certification gap: start ${missingCerts[0]} application or identify a qualified subcontractor`
      : 'Prepare a tailored capability statement highlighting your NAICS and certifications',
    'Identify at least two potential teaming partners to cover any capability gaps',
    `Submit your proposal before ${new Date(contract.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
  ]

  const questions_for_contracting_officer = [
    'Is there an incumbent contractor and what is their past performance rating?',
    'What evaluation factors and weights will be used to score proposals?',
    'Will there be a pre-proposal conference or Industry Day?',
    'What is the expected period of performance and are option years included?',
    'Are small business subcontracting requirements applicable?',
  ]

  const fitLabel = fitScore >= 70 ? 'strong' : fitScore >= 45 ? 'moderate' : 'limited'
  const executive_summary =
    `This opportunity is a ${fitLabel} fit for ${profile.business_name} with a fit score of ${fitScore}/100 ` +
    `and an estimated win probability of ${winProbability}%. ` +
    (fitScore >= 60
      ? `Your ${profile.naics_codes[0]} NAICS expertise${matchedCerts.length > 0 ? ` and ${matchedCerts[0]} certification` : ''} directly align with the agency's requirements — this opportunity is worth pursuing.`
      : missingCerts.length > 0
        ? `A key gap is the missing ${missingCerts[0]} certification. Consider teaming with a certified partner or addressing this gap before proposal submission.`
        : `Review the full solicitation carefully and assess whether your capabilities match the technical requirements before committing proposal resources.`)

  return {
    contract_id:                       contract.id,
    business_profile_id:               profile.id,
    fit_score:                         fitScore,
    win_probability:                   winProbability,
    risk_level:                        riskLevel,
    proposal_effort:                   proposalEffort,
    executive_summary,
    why_it_matches,
    risks,
    missing_requirements,
    recommended_next_steps,
    questions_for_contracting_officer,
    ai_model:                          undefined,
    is_ai_generated:                   false,
  }
}

// ── Public entry point ───────────────────────────────────────

export async function analyzeContract(
  contract: Contract,
  profile: BusinessProfile,
): Promise<ContractAnalysis> {
  // Try Anthropic first
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await callAnthropic(contract, profile)
    } catch (err) {
      console.error('[analyzeContract] Anthropic failed, trying fallback:', err)
    }
  }

  // Try OpenAI second
  if (process.env.OPENAI_API_KEY) {
    try {
      return await callOpenAI(contract, profile)
    } catch (err) {
      console.error('[analyzeContract] OpenAI failed, using rule-based fallback:', err)
    }
  }

  // Rule-based fallback (always works)
  return ruleBasedAnalysis(contract, profile)
}

// ── Demo profile (used when no profile is selected) ──────────

export const DEMO_PROFILE: BusinessProfile = {
  id:                        'demo',
  business_name:             'Demo Small Business LLC',
  industry:                  'Information Technology',
  naics_codes:               ['541512', '541519', '541511'],
  fsc_codes:                 [],
  nsn_interest:              [],
  keywords:                  ['cybersecurity', 'cloud', 'federal IT', 'network monitoring'],
  city:                      'Arlington',
  state:                     'VA',
  service_radius:            150,
  certifications:            ['SDVOSB', 'SDB'],
  years_in_business:         8,
  past_government_experience: true,
  email:                     'contact@demobusiness.com',
}
