import type { Contract, OpportunityBrief, BusinessProfile, ProposalStrategy } from '@/types'

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

function addDays(date: string, n: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function fmtMoney(n?: number) {
  if (!n) return 'TBD'
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
    : `$${(n / 1_000).toFixed(0)}K`
}

// ── NAICS match scoring ───────────────────────────────────────

function naicsMatchScore(profileCodes: string[], contractCodes: string[]): number {
  if (profileCodes.length === 0 || contractCodes.length === 0) return 30
  let best = 0
  for (const p of profileCodes) {
    for (const c of contractCodes) {
      const minLen = Math.min(p.length, c.length)
      let common = 0
      for (let i = 0; i < minLen; i++) {
        if (p[i] === c[i]) common++
        else break
      }
      const score =
        common >= 6 ? 100 :
        common >= 4 ? 80  :
        common >= 3 ? 60  :
        common >= 2 ? 40  : 20
      if (score > best) best = score
    }
  }
  return best
}

// ── FSC match scoring (for DIBBS contracts) ───────────────────

function fscMatchScore(profileCodes: string[], contractCodes: string[] | undefined): number {
  if (!contractCodes?.length) return 0 // N/A for non-DIBBS
  if (!profileCodes.length) return 0
  const contract4 = contractCodes.map(c => c.slice(0, 4))
  const profile4  = profileCodes.map(p => p.slice(0, 4))
  const matched = contract4.some(c => profile4.includes(c))
  return matched ? 100 : 0
}

// ── Rule-based strategy ───────────────────────────────────────

function ruleBasedStrategy(
  contract: Contract,
  brief:    OpportunityBrief | null,
  profile:  BusinessProfile,
): ProposalStrategy {
  const days   = daysUntil(contract.due_date)
  const value  = contract.value_max ?? contract.value_min ?? 0
  const certs  = contract.certifications_required

  // ── Scoring components ────────────────────────────────────

  const naicsScore = naicsMatchScore(profile.naics_codes, contract.naics_codes)

  const hasFsc     = (contract.fsc_codes?.length ?? 0) > 0
  const fscScore   = hasFsc ? fscMatchScore(profile.fsc_codes, contract.fsc_codes) : 0

  const certRequired = certs.length > 0
  const certHeld     = certRequired
    ? certs.some(c => profile.certifications.includes(c))
    : false
  // 0 = required but missing, 70 = open competition, 100 = cert held
  const certScore = certRequired ? (certHeld ? 100 : 0) : 70

  const stateMatch   = profile.state === contract.state || contract.state === 'National'
  const geoScore     = stateMatch ? 100 : 55

  const expScore =
    (profile.past_government_experience ? 60 : 20) +
    (profile.years_in_business >= 10 ? 30 : profile.years_in_business >= 5 ? 20 : 10)

  // DIBBS contracts also weigh FSC match
  let rawScore: number
  if (hasFsc) {
    rawScore = naicsScore * 0.20 + certScore * 0.30 + geoScore * 0.10 + expScore * 0.10 + fscScore * 0.30
  } else {
    rawScore = naicsScore * 0.35 + certScore * 0.35 + geoScore * 0.15 + expScore * 0.15
  }

  // Blend with AI brief scores if available
  if (brief) {
    rawScore = rawScore * 0.6 + brief.fit_score * 0.4
  }

  // Timeline penalty for very short windows
  if (days < 14) rawScore -= 10
  if (days < 7)  rawScore -= 10

  const confidence = clamp(Math.round(rawScore), 5, 95)

  const recommendation: ProposalStrategy['recommendation'] =
    certRequired && !certHeld    ? 'NO-GO'      : // Hard stop: missing required cert
    confidence >= 65             ? 'GO'          :
    confidence >= 42             ? 'CONDITIONAL' :
                                   'NO-GO'

  // ── Strengths ─────────────────────────────────────────────

  const strengths: string[] = []
  if (naicsScore >= 80) {
    strengths.push(`Your NAICS code${profile.naics_codes.length > 1 ? 's' : ''} (${profile.naics_codes.slice(0, 2).join(', ')}) directly align with this contract`)
  } else if (naicsScore >= 60) {
    strengths.push(`Partial NAICS alignment — you operate in a related industry segment`)
  }
  if (certHeld) {
    strengths.push(`You hold the required ${certs.join(' / ')} certification — you are eligible to bid`)
  }
  if (!certRequired) {
    strengths.push('Full & open competition — no set-aside certification required to bid')
  }
  if (stateMatch) {
    strengths.push(`Your business location (${profile.state}) matches the performance location`)
  }
  if (profile.past_government_experience) {
    strengths.push('Prior government contract experience adds credibility to your proposal')
  }
  if (profile.years_in_business >= 5) {
    strengths.push(`${profile.years_in_business}+ years in business demonstrates stability and past performance`)
  }
  if (hasFsc && fscScore === 100) {
    strengths.push(`Your FSC codes (${profile.fsc_codes.slice(0, 2).join(', ')}) match the supply classification of this solicitation`)
  }
  if (brief && brief.fit_score >= 70) {
    strengths.push(`AI opportunity analysis rates this contract ${brief.fit_score}% attractive for eligible businesses`)
  }
  if (value > 0 && value < 250_000) {
    strengths.push('Contract value is within typical small-business reach — reduced bonding requirements')
  }

  // ── Weaknesses ────────────────────────────────────────────

  const weaknesses: string[] = []
  if (certRequired && !certHeld) {
    weaknesses.push(`You are missing the required ${certs.join(' / ')} certification — ineligible to bid as prime`)
  }
  if (naicsScore < 60) {
    weaknesses.push('Limited NAICS alignment — this may be outside your core capabilities or market')
  }
  if (!stateMatch) {
    weaknesses.push(`Work is in ${contract.state} while your business is in ${profile.state} — may require a local presence`)
  }
  if (!profile.past_government_experience) {
    weaknesses.push('No prior government contracting experience — past performance section will be thin')
  }
  if (profile.years_in_business < 3) {
    weaknesses.push('Limited years in business may affect past performance and bonding capacity')
  }
  if (days < 21) {
    weaknesses.push(`Only ${days} days to the proposal deadline — accelerated preparation required`)
  }
  if (value > 5_000_000) {
    weaknesses.push('Large contract value may require bonding, strong financials, and significant past performance')
  }
  if (!certRequired && value > 1_000_000) {
    weaknesses.push('Full & open competition with large value — differentiation and competitive pricing are critical')
  }
  if (hasFsc && fscScore === 0) {
    weaknesses.push(`None of your FSC codes match the supply class of this DIBBS solicitation`)
  }

  // ── Required documents ────────────────────────────────────

  const docs = ['Technical Proposal / Capability Statement', 'Past Performance Volume (3 references)', 'Price / Cost Proposal']
  if (value > 750_000) {
    docs.push('Representations and Certifications (SAM.gov current)', 'Small Business Subcontracting Plan')
  }
  if (certRequired) {
    docs.push(`${certs.join(' / ')} certification letter and SAM.gov registration`)
  }
  if (contract.naics_codes.some(n => n.startsWith('54'))) {
    docs.push('Technical Staffing Plan and Key Personnel Resumes')
  }
  if (contract.naics_codes.some(n => n.startsWith('23'))) {
    docs.push('SF-1442, Bid Bond / Performance Bond, Safety Plan')
  }

  // ── Evaluation factors ────────────────────────────────────

  const evalFactors: Record<string, string> = {}

  evalFactors['Technical Approach'] =
    `Demonstrate specific experience in ${contract.agency} or similar agency work; describe your methodology clearly`
  evalFactors['Past Performance'] =
    `Provide ${value > 1_000_000 ? '5' : '3'} relevant contract references with scope, value, and customer contact`
  evalFactors['Price / Cost'] =
    `Research market rates; ${value < 500_000 ? 'competitive fixed-price' : 'detailed cost build-up'} expected`
  if (certRequired) {
    evalFactors['Business Size & Status'] =
      `Confirm active SAM.gov registration showing ${certs.join(' / ')} designation`
  }
  if (hasFsc) {
    evalFactors['Supply Qualifications'] =
      `Provide manufacturer or distributor authorization documentation for the listed NSN / FSC items`
  }

  // ── Pricing guidance ──────────────────────────────────────

  let pricing: string
  if (!value || value === 0) {
    pricing = 'Value not specified — request a government estimate or comparable contract data before pricing. Submit a competitive rate with a clear cost build-up.'
  } else if (value < 250_000) {
    pricing = `Small-dollar contract (${fmtMoney(value)}): fixed-price preferred. Price to win at 10–20% margin. Government buyers at this level prioritize lowest price technically acceptable (LPTA).`
  } else if (value < 2_000_000) {
    pricing = `Mid-tier contract (${fmtMoney(value)}): firm-fixed-price (FFP) with separate CLINs for travel, materials, and ODCs. Build detailed cost estimate; target 15–25% profit margin. Consider volume discounts.`
  } else {
    pricing = `Large contract (${fmtMoney(value)}): prepare a detailed cost build-up with labor categories, rates, and escalation. T&M or IDIQ structure likely. Auditable accounting system may be required. Engage a pricing specialist.`
  }

  // ── Teaming recommendations ───────────────────────────────

  const teaming: string[] = []
  if (certRequired && !certHeld) {
    teaming.push(`You must partner with a ${certs.join(' / ')}-certified firm as the prime contractor to be eligible`)
  }
  if (naicsScore < 60) {
    teaming.push(`Subcontract to or team with a firm holding NAICS ${contract.naics_codes[0] ?? ''} expertise to strengthen technical credibility`)
  }
  if (!stateMatch) {
    teaming.push(`Partner with a ${contract.state}-based subcontractor to demonstrate local knowledge and presence`)
  }
  if (!profile.past_government_experience) {
    teaming.push('Consider a mentor–protégé arrangement or teaming with an experienced prime to build past performance')
  }
  if (value > 5_000_000) {
    teaming.push('Large contract value may require teaming for bonding capacity, past performance breadth, or staffing depth')
  }
  if (teaming.length === 0) {
    teaming.push('No teaming required — your profile aligns well; subcontracting may improve geographic coverage or specialization')
  }

  // ── Timeline ──────────────────────────────────────────────

  const qDeadline  = addDays(contract.due_date, -14)
  const awardDate  = addDays(contract.due_date, 60)

  const timeline: Record<string, string> = {
    register_and_review: 'Immediately — verify SAM.gov registration and download full solicitation',
    submit_questions:    `By ${qDeadline} — submit questions to the contracting officer`,
    proposal_due:        contract.due_date,
    award_expected:      awardDate,
  }

  // ── Next steps ────────────────────────────────────────────

  const nextSteps: string[] = [
    `Download the full solicitation from ${contract.source_url ?? 'the source portal'}`,
    'Review all evaluation criteria, attachments, and amendments',
  ]

  if (certRequired) {
    if (certHeld) {
      nextSteps.push(`Confirm your ${certs[0]} certification is active and correctly reflected in SAM.gov`)
    } else {
      nextSteps.push(`Explore teaming with a ${certs.join(' / ')}-certified prime contractor — you cannot bid solo`)
    }
  }

  if (!profile.past_government_experience) {
    nextSteps.push('Compile a commercial past performance package (client references, scopes, values, outcomes)')
  }

  nextSteps.push(
    'Prepare a tailored technical approach and a compelling executive summary',
    `Submit any questions by ${qDeadline} — attend the pre-proposal conference if offered`,
    `Have a pricing analyst review your cost estimate before submitting on ${contract.due_date}`,
  )

  return {
    contract_id:             contract.id,
    business_profile_id:     profile.id!,
    recommendation,
    confidence_score:        confidence,
    strengths,
    weaknesses,
    required_documents:      docs,
    evaluation_factors:      evalFactors,
    pricing_guidance:        pricing,
    teaming_recommendations: teaming,
    timeline,
    next_steps:              nextSteps,
    generated_by:            'rule-based',
  }
}

// ── AI prompt ─────────────────────────────────────────────────

function buildPrompt(
  contract: Contract,
  brief:    OpportunityBrief | null,
  profile:  BusinessProfile,
): string {
  const days = daysUntil(contract.due_date)
  return `You are an expert government contracting bid/no-bid analyst. Evaluate this specific contract for this specific business.

BUSINESS PROFILE
================
Name:         ${profile.business_name}
Industry:     ${profile.industry}
NAICS Codes:  ${profile.naics_codes.join(', ') || 'None listed'}
Certifications: ${profile.certifications.join(', ') || 'None'}
Location:     ${profile.city}, ${profile.state}
FSC Codes:    ${profile.fsc_codes.join(', ') || 'None'}
Govt Experience: ${profile.past_government_experience ? 'Yes' : 'No'}
Years in Business: ${profile.years_in_business}
Capabilities: ${profile.keywords.join(', ') || 'Not specified'}

CONTRACT OPPORTUNITY
====================
Title:    ${contract.title}
Agency:   ${contract.agency}
Location: ${contract.location} (${contract.state})
NAICS:    ${contract.naics_codes.join(', ')}
Value:    ${contract.value_min || contract.value_max ? `${fmtMoney(contract.value_min)} – ${fmtMoney(contract.value_max)}` : 'TBD'}
Due:      ${contract.due_date} (${days} days)
Set-asides: ${contract.certifications_required.length > 0 ? contract.certifications_required.join(', ') : 'Full & Open Competition'}
${contract.fsc_codes?.length ? `FSC Codes: ${contract.fsc_codes.join(', ')}` : ''}
${contract.solicitation_number ? `Solicitation: ${contract.solicitation_number}` : ''}

Description:
${contract.description.slice(0, 1200)}
${brief ? `
PRE-ANALYSIS (from opportunity brief)
=====================================
Fit Score: ${brief.fit_score}/100
Win Probability: ${brief.win_probability}%
Competition: ${brief.competition_level}
Complexity: ${brief.proposal_complexity}
` : ''}
Return ONLY valid JSON — no markdown, no prose outside the JSON:

{
  "recommendation": "GO" | "NO-GO" | "CONDITIONAL",
  "confidence_score": <0-100 — how strongly you recommend this decision>,
  "strengths": [<2-5 specific reasons this business is well-positioned>],
  "weaknesses": [<2-4 gaps, risks, or challenges specific to this profile + contract>],
  "required_documents": [<4-7 documents the business must submit>],
  "evaluation_factors": {
    "<factor_name>": "<how_this_business_should_address_it>",
    ...
  },
  "pricing_guidance": "<2-3 sentences on pricing strategy and target margins>",
  "teaming_recommendations": [<1-3 teaming or subcontracting recommendations, or state 'none needed'>],
  "timeline": {
    "register_and_review": "Immediately — verify SAM.gov and download solicitation",
    "submit_questions": "By <date 14 days before due>",
    "proposal_due": "${contract.due_date}",
    "award_expected": "<date 60 days after due>"
  },
  "next_steps": [<5-7 specific, actionable steps this business should take now>]
}

Decision guidance:
- GO (confidence 65-95): strong NAICS/cert match, reasonable timeline, competitive value
- CONDITIONAL (confidence 42-64): partial match, needs teaming or cert, manageable risks
- NO-GO (confidence 5-41): missing required cert, outside capabilities, or insufficient resources`
}

// ── Parse AI response ─────────────────────────────────────────

function parseResponse(
  text:       string,
  contractId: string,
  profileId:  string,
  model:      string,
): ProposalStrategy {
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

  const RECS = ['GO', 'NO-GO', 'CONDITIONAL'] as const
  const rec  = RECS.includes(parsed.recommendation as 'GO') ? parsed.recommendation as ProposalStrategy['recommendation'] : 'CONDITIONAL'

  return {
    contract_id:             contractId,
    business_profile_id:     profileId,
    recommendation:          rec,
    confidence_score:        clamp(Math.round(Number(parsed.confidence_score ?? 50)), 0, 100),
    strengths:               ensureStrings(parsed.strengths),
    weaknesses:              ensureStrings(parsed.weaknesses),
    required_documents:      ensureStrings(parsed.required_documents),
    evaluation_factors:      ensureObj(parsed.evaluation_factors),
    pricing_guidance:        String(parsed.pricing_guidance ?? ''),
    teaming_recommendations: ensureStrings(parsed.teaming_recommendations),
    timeline:                ensureObj(parsed.timeline),
    next_steps:              ensureStrings(parsed.next_steps),
    generated_by:            model,
  }
}

// ── Anthropic ─────────────────────────────────────────────────

async function callAnthropic(
  contract: Contract,
  brief:    OpportunityBrief | null,
  profile:  BusinessProfile,
): Promise<ProposalStrategy> {
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
      system:     'You are an expert government contracting bid/no-bid strategist. Return only valid JSON.',
      messages:   [{ role: 'user', content: buildPrompt(contract, brief, profile) }],
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
  }

  const json = await res.json() as { content?: { type: string; text: string }[] }
  const text = json.content?.find(b => b.type === 'text')?.text ?? ''
  if (!text) throw new Error('Anthropic returned empty content')

  return parseResponse(text, contract.id, profile.id!, `anthropic/${model}`)
}

// ── Public entry point ────────────────────────────────────────

export async function generateProposalStrategy(
  contract: Contract,
  brief:    OpportunityBrief | null,
  profile:  BusinessProfile,
): Promise<ProposalStrategy> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await callAnthropic(contract, brief, profile)
    } catch (err) {
      console.error('[generateProposalStrategy] Anthropic failed:', err)
    }
  }

  return ruleBasedStrategy(contract, brief, profile)
}
