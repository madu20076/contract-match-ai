import type { Contract, RFPRequirementType } from '@/types'

// ── Output types ──────────────────────────────────────────────

export interface ParsedRequirement {
  type:     RFPRequirementType
  text:     string
  section:  string
  priority: 'critical' | 'high' | 'medium' | 'low'
}

export interface ParsedEvalFactor {
  name:        string
  weight:      string
  description: string
}

export interface ParsedCLIN {
  number:      string
  description: string
  quantity:    string
  unit:        string
}

export interface ParsedAmendment {
  number:         string
  date:           string
  changes:        string[]
  due_date_change: string
}

export interface ParsedRFP {
  agency:               string
  solicitation_number:  string
  contract_type:        string
  proposal_due_date:    string
  performance_start:    string
  performance_end:      string
  set_aside:            string
  naics_code:           string
  evaluation_factors:   ParsedEvalFactor[]
  requirements:         ParsedRequirement[]
  deliverables:         ParsedRequirement[]
  certifications:       ParsedRequirement[]
  clins:                ParsedCLIN[]
  attachments:          string[]
  amendments:           ParsedAmendment[]
  key_dates:            Array<{ label: string; date: string }>
  parsed_by:            'claude' | 'rules'
}

// ── Rule-based parser ─────────────────────────────────────────

const MANDATORY_PATTERN = /\b(shall|must|required to|is required|will be required|shall provide|shall submit|is mandatory)\b/gi
const DATE_PATTERN      = /(?:due|deadline|submit(?:ted)? by|close(?:s)? on|response due|offer due)[:\s]+([A-Z][a-z]+ \d{1,2},?\s*\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi
const SOL_NUM_PATTERN   = /(?:solicitation|rfp|rfq|ib|ssn|fa\d{4})[:\s#-]*([A-Z0-9]{3,}[-][A-Z0-9\-]+)/gi
const CLIN_PATTERN      = /CLIN\s*(\d{4}[A-Z]?)[:\s\-]+([^\n\r.]{10,100})/gi
const CERT_PATTERN      = /\b(ISO\s*\d{4,5}(?::\d{4})?|CMMI(?:\s*(?:DEV|SVC|ACQ))?(?:\s*ML\s*\d)?|DCAA|SOC\s*[12]|FedRAMP|NIST\s*800-\d+|GSA\s*Schedule|8\(a\)|HUBZone|SDVOSB|WOSB|VOSB|EDWOSB)\b/gi
const AMENDMENT_PATTERN = /(?:amendment|modification)\s*(?:number)?\s*(\d{1,3}|[A-Z]\d+)/gi

function firstMatch(pattern: RegExp, text: string): string {
  const match = pattern.exec(text)
  return match ? match[1]?.trim() ?? '' : ''
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 500)
}

function detectPriority(text: string): 'critical' | 'high' | 'medium' | 'low' {
  const low = text.toLowerCase()
  if (/\b(shall|mandatory|required|must)\b/.test(low)) return 'critical'
  if (/\b(should|highly desired|important)\b/.test(low)) return 'high'
  if (/\b(may|desired|preferred)\b/.test(low)) return 'low'
  return 'medium'
}

function detectSection(text: string, index: number): string {
  // Simple heuristic: look for "Section X" or "L.X" preceding patterns
  const secMatch = text.slice(Math.max(0, index - 200), index).match(/(?:Section\s*[A-Z\d.]+|[A-Z]\.\d+[\d.]*)\s*[-—:]?\s*[A-Z][^:.\n]{5,40}/gi)
  return secMatch ? secMatch[secMatch.length - 1]?.trim().slice(0, 50) : 'General'
}

export function parseWithRules(text: string, contract?: Contract | null): ParsedRFP {
  // -- Agency / solicitation number
  const agency = (contract?.agency ?? firstMatch(/(?:issued by|contracting office)[:\s]+([^\n]{5,60})/i, text)) || 'Unknown Agency'
  const rawSolNum = firstMatch(SOL_NUM_PATTERN, text)
  const solicitationNumber = rawSolNum || contract?.solicitation_number || 'TBD'

  // -- Contract type
  const ctMatch = text.match(/\b(Firm[- ]Fixed[- ]Price|FFP|Cost[- ]Plus[- ]Fixed[- ]Fee|CPFF|Time and Materials|T&M|Indefinite[- ]Delivery|IDIQ|BPA|SBIR|STTR)\b/i)
  const contractType = ctMatch ? ctMatch[1] : contract?.solicitation_type ?? 'TBD'

  // -- Dates
  const datesFound: Array<{ label: string; date: string }> = []
  let rawDate: RegExpExecArray | null
  const dateRe = new RegExp(DATE_PATTERN.source, DATE_PATTERN.flags)
  while ((rawDate = dateRe.exec(text)) !== null) {
    datesFound.push({ label: rawDate[0].split(/[:\s]/)[0].toLowerCase(), date: rawDate[1] })
  }
  const proposalDueDate = datesFound.find(d => d.label.includes('proposal') || d.label.includes('offer') || d.label.includes('submit'))?.date
    ?? contract?.due_date
    ?? 'TBD'

  // -- Eval factors
  const evalSection  = text.match(/(?:Section M|Evaluation Criteria|Evaluation Factors)[\s\S]{0,3000}?(?=Section [A-Z]|$)/i)?.[0] ?? ''
  const evalFactors: ParsedEvalFactor[] = []
  const efRe = /(?:Factor\s*\d+|Criteria\s*\d+)?\s*(Technical\s*\w+|Management\s*\w+|Past\s*Performance|Price|Cost|Small\s*Business)[^\n]{0,200}/gi
  let efMatch: RegExpExecArray | null
  while ((efMatch = efRe.exec(evalSection)) !== null && evalFactors.length < 6) {
    evalFactors.push({ name: efMatch[1].trim(), weight: 'TBD', description: efMatch[0].slice(0, 120).trim() })
  }
  if (evalFactors.length === 0) {
    evalFactors.push(
      { name: 'Technical Approach',  weight: 'Most Important', description: 'Technical merit of proposed approach' },
      { name: 'Management Approach', weight: 'Important',      description: 'Project management capability' },
      { name: 'Past Performance',    weight: 'Important',      description: 'Relevant past contract performance' },
      { name: 'Price / Cost',        weight: 'Independent',    description: 'Proposed total price / cost' },
    )
  }

  // -- Mandatory requirements (SHALL / MUST sentences)
  const requirements: ParsedRequirement[] = []
  const sentences = splitSentences(text)
  sentences.forEach((sentence) => {
    if (MANDATORY_PATTERN.test(sentence) && requirements.length < 25) {
      MANDATORY_PATTERN.lastIndex = 0
      requirements.push({
        type:     'mandatory',
        text:     sentence.slice(0, 250),
        section:  detectSection(text, text.indexOf(sentence)),
        priority: detectPriority(sentence),
      })
    }
  })

  // Fill with generics if nothing found
  if (requirements.length === 0 && contract?.requirements) {
    contract.requirements.slice(0, 10).forEach(r => {
      requirements.push({ type: 'mandatory', text: r, section: 'Statement of Work', priority: 'high' })
    })
  }

  // -- Deliverables
  const deliverables: ParsedRequirement[] = []
  const delRe = /(?:deliverable|CDRL|report|submittal|data item)[^\n.]{10,200}/gi
  let delMatch: RegExpExecArray | null
  while ((delMatch = delRe.exec(text)) !== null && deliverables.length < 10) {
    deliverables.push({ type: 'deliverable', text: delMatch[0].slice(0, 200).trim(), section: 'Deliverables', priority: 'high' })
  }

  // -- Certifications
  const certTexts = new Set<string>()
  const certRe = new RegExp(CERT_PATTERN.source, CERT_PATTERN.flags)
  let certMatch: RegExpExecArray | null
  const certifications: ParsedRequirement[] = []
  while ((certMatch = certRe.exec(text)) !== null) {
    const key = certMatch[1].toUpperCase().replace(/\s+/g, ' ')
    if (!certTexts.has(key)) {
      certTexts.add(key)
      certifications.push({ type: 'certification', text: key, section: 'Requirements', priority: 'critical' })
    }
  }

  // -- CLINs
  const clins: ParsedCLIN[] = []
  const clinRe = new RegExp(CLIN_PATTERN.source, CLIN_PATTERN.flags)
  let clinMatch: RegExpExecArray | null
  while ((clinMatch = clinRe.exec(text)) !== null && clins.length < 10) {
    clins.push({ number: clinMatch[1], description: clinMatch[2].trim(), quantity: 'TBD', unit: 'TBD' })
  }

  // -- Attachments
  const attachments: string[] = []
  const attRe = /(?:Attachment|Exhibit|Appendix)\s+([A-Z\d]+)[:\s—–-]+([^\n]{10,80})/gi
  let attMatch: RegExpExecArray | null
  while ((attMatch = attRe.exec(text)) !== null && attachments.length < 8) {
    attachments.push(`${attMatch[1]}: ${attMatch[2].trim()}`)
  }

  // -- Amendments
  const amendments: ParsedAmendment[] = []
  const amdRe = new RegExp(AMENDMENT_PATTERN.source, AMENDMENT_PATTERN.flags)
  let amdMatch: RegExpExecArray | null
  while ((amdMatch = amdRe.exec(text)) !== null && amendments.length < 5) {
    amendments.push({ number: amdMatch[1], date: 'TBD', changes: ['See amendment document'], due_date_change: '' })
  }

  // -- NAICS
  const naicsMatch = text.match(/NAICS\s*(?:Code)?\s*:?\s*(\d{4,6})/i)
  const naicsCode  = naicsMatch?.[1] ?? contract?.naics_codes?.[0] ?? ''

  // -- Set-aside
  const saMatch = text.match(/\b(Total Small Business|8\(a\)|HUBZone|SDVOSB|WOSB|EDWOSB|Unrestricted|Full and Open)\b/i)
  const setAside = saMatch?.[1] ?? 'Full and Open'

  return {
    agency,
    solicitation_number: solicitationNumber,
    contract_type:       contractType,
    proposal_due_date:   proposalDueDate,
    performance_start:   'TBD',
    performance_end:     'TBD',
    set_aside:           setAside,
    naics_code:          naicsCode,
    evaluation_factors:  evalFactors,
    requirements,
    deliverables,
    certifications,
    clins,
    attachments,
    amendments,
    key_dates:           datesFound.slice(0, 6),
    parsed_by:           'rules',
  }
}

// ── Claude path ───────────────────────────────────────────────

function buildRFPPrompt(text: string, contract?: Contract | null): string {
  const snippet = text.slice(0, 7000)
  const contractCtx = contract
    ? `\nKnown contract context: title="${contract.title}", agency="${contract.agency}", sol#="${contract.solicitation_number ?? 'unknown'}"`
    : ''

  return [
    'You are an expert federal procurement analyst. Extract structured data from this solicitation text.',
    contractCtx,
    '',
    'Return a JSON object with EXACTLY these fields (no extra commentary):',
    '{',
    '  "agency": "...",',
    '  "solicitation_number": "...",',
    '  "contract_type": "FFP|T&M|CPFF|IDIQ|BPA|other",',
    '  "proposal_due_date": "YYYY-MM-DD or TBD",',
    '  "performance_start": "YYYY-MM-DD or TBD",',
    '  "performance_end": "YYYY-MM-DD or TBD",',
    '  "set_aside": "Total SB|8(a)|HUBZone|SDVOSB|WOSB|Unrestricted",',
    '  "naics_code": "6-digit NAICS or empty string",',
    '  "evaluation_factors": [{"name":"...","weight":"...","description":"..."}],',
    '  "requirements": [{"type":"mandatory","text":"...","section":"...","priority":"critical|high|medium|low"}],',
    '  "deliverables": [{"type":"deliverable","text":"...","section":"...","priority":"high|medium|low"}],',
    '  "certifications": [{"type":"certification","text":"...","section":"...","priority":"critical|high|medium|low"}],',
    '  "clins": [{"number":"0001","description":"...","quantity":"1","unit":"EA"}],',
    '  "attachments": ["Attachment A: PWS", ...],',
    '  "amendments": [{"number":"1","date":"YYYY-MM-DD","changes":["..."],"due_date_change":""}],',
    '  "key_dates": [{"label":"Proposal Due","date":"YYYY-MM-DD"}]',
    '}',
    '',
    'Extract up to 20 mandatory requirements (SHALL/MUST sentences), 6 evaluation factors, 8 deliverables, 5 certifications.',
    'For requirements missing from the text, make reasonable inferences from context.',
    '',
    '--- SOLICITATION TEXT START ---',
    snippet,
    '--- SOLICITATION TEXT END ---',
  ].join('\n')
}

async function parseWithAI(apiKey: string, text: string, contract?: Contract | null): Promise<ParsedRFP> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 3000,
      messages:   [{ role: 'user', content: buildRFPPrompt(text, contract) }],
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!resp.ok) {
    const msg = await resp.text().catch(() => '')
    throw new Error(`Anthropic ${resp.status}: ${msg.slice(0, 200)}`)
  }

  const data = await resp.json() as { content: Array<{ type: string; text: string }> }
  const raw  = data.content.find(b => b.type === 'text')?.text ?? ''
  if (!raw) throw new Error('Empty Anthropic response')

  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const parsed  = JSON.parse(jsonStr) as Partial<ParsedRFP>

  return {
    agency:               parsed.agency              ?? contract?.agency ?? 'Unknown',
    solicitation_number:  parsed.solicitation_number ?? contract?.solicitation_number ?? 'TBD',
    contract_type:        parsed.contract_type        ?? 'TBD',
    proposal_due_date:    parsed.proposal_due_date    ?? contract?.due_date ?? 'TBD',
    performance_start:    parsed.performance_start    ?? 'TBD',
    performance_end:      parsed.performance_end      ?? 'TBD',
    set_aside:            parsed.set_aside            ?? 'TBD',
    naics_code:           parsed.naics_code           ?? contract?.naics_codes?.[0] ?? '',
    evaluation_factors:   parsed.evaluation_factors   ?? [],
    requirements:         parsed.requirements         ?? [],
    deliverables:         parsed.deliverables         ?? [],
    certifications:       parsed.certifications       ?? [],
    clins:                parsed.clins                ?? [],
    attachments:          parsed.attachments          ?? [],
    amendments:           parsed.amendments           ?? [],
    key_dates:            parsed.key_dates            ?? [],
    parsed_by:            'claude',
  }
}

// ── Public API ────────────────────────────────────────────────

export async function parseRFPDocument({
  text,
  contract,
}: {
  text:       string
  contract?:  Contract | null
}): Promise<ParsedRFP> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey && text.length > 100) {
    try {
      return await parseWithAI(apiKey, text, contract)
    } catch (err) {
      console.error('[rfp-parser] Claude error, falling back to rules:', err)
    }
  }
  return parseWithRules(text, contract)
}

// ── Text extractors ───────────────────────────────────────────

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth')
    const result  = await mammoth.extractRawText({ buffer })
    return result.value ?? ''
  } catch (err) {
    console.error('[rfp-parser] DOCX extraction error:', err)
    return ''
  }
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    type PdfFn = (buf: Buffer) => Promise<{ text: string }>
    // pdf-parse ships both ESM and CJS; the ESM entry does not declare .default
    // in the @types package, so we cast through unknown to call it safely at runtime
    const mod = (await import('pdf-parse')) as unknown as { default: PdfFn } | PdfFn
    const fn  = typeof mod === 'function' ? mod : (mod as { default: PdfFn }).default
    const result = await fn(buffer)
    return result.text ?? ''
  } catch (err) {
    console.error('[rfp-parser] PDF extraction error:', err)
    return ''
  }
}
