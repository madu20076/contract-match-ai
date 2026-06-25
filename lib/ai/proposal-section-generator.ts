import type {
  Contract,
  BusinessProfile,
  ProposalStrategy,
  OpportunityBrief,
  SectionType,
} from '@/types'

export interface SectionInput {
  contract:          Contract
  businessProfile:   BusinessProfile
  proposalStrategy?: ProposalStrategy | null
  opportunityBrief?: OpportunityBrief | null
  sectionType:       SectionType
}

export const SECTION_TITLES: Record<SectionType, string> = {
  executive_summary:  'Executive Summary',
  technical_approach: 'Technical Approach',
  management_plan:    'Management Plan',
  staffing_plan:      'Staffing Plan',
  quality_control:    'Quality Control Plan',
  past_performance:   'Past Performance',
  pricing_narrative:  'Pricing Narrative',
  cover_letter:       'Cover Letter',
  compliance_matrix:  'Compliance Matrix',
}

// ── Template builders ─────────────────────────────────────────

function ctx(input: SectionInput) {
  const { contract: c, businessProfile: b, proposalStrategy: s } = input
  const certList   = (b.certifications ?? []).slice(0, 3).join(', ') || 'various certifications'
  const strength1  = s?.strengths?.[0] ?? 'Strong industry expertise and technical capabilities'
  const strength2  = s?.strengths?.[1] ?? 'Proven past performance with government clients'
  const strength3  = s?.strengths?.[2] ?? 'Qualified and experienced project team'
  const solNum     = c.solicitation_number ? ` (Solicitation ${c.solicitation_number})` : ''
  const reqList    = (c.requirements ?? []).slice(0, 5).map((r, i) => `${i + 1}. ${r}`).join('\n')

  return { c, b, s, certList, strength1, strength2, strength3, solNum, reqList }
}

function buildExecutiveSummary(input: SectionInput): string {
  const { c, b, certList, strength1, strength2, strength3, solNum } = ctx(input)
  return `EXECUTIVE SUMMARY

${b.business_name} is proud to submit this proposal in response to ${c.agency}'s solicitation${solNum} for ${c.title}.

COMPANY OVERVIEW
${b.business_name}, headquartered in ${b.city}, ${b.state}, is a ${certList}-certified firm with ${b.years_in_business} years of experience delivering ${b.industry} solutions to government clients. We bring a dedicated team, proven processes, and a commitment to mission success that sets us apart from the competition.

VALUE PROPOSITION
${b.business_name} offers ${c.agency} the following distinct advantages:
• ${strength1}
• ${strength2}
• ${strength3}
• Local presence and rapid response capability in ${b.state}

APPROACH SUMMARY
Our proposed approach addresses every requirement in the solicitation through a structured, phased methodology. We will mobilize swiftly, establish clear communication protocols, and deliver measurable outcomes throughout the performance period — on time and within budget.

MANAGEMENT COMMITMENT
${b.business_name} leadership is personally invested in the success of this contract. We will assign our most experienced professionals to this work and provide continuous management oversight to ensure ${c.agency} receives the highest quality of service.

We welcome the opportunity to discuss our qualifications and look forward to supporting ${c.agency}'s important mission.`
}

function buildTechnicalApproach(input: SectionInput): string {
  const { c, b, reqList } = ctx(input)
  return `TECHNICAL APPROACH

${b.business_name} proposes a structured, three-phase approach to deliver ${c.title} in full compliance with all stated requirements.

PHASE 1 — MOBILIZATION & PLANNING (Weeks 1–2)
During the mobilization phase, we will:
• Conduct a kickoff meeting with ${c.agency} stakeholders to confirm requirements and priorities
• Establish project management infrastructure (tracking, reporting, communication channels)
• Assign key personnel and finalize the detailed execution schedule
• Conduct a thorough review of all solicitation documents and applicable standards

PHASE 2 — EXECUTION & DELIVERY
Our execution methodology follows industry best practices tailored to this specific requirement:
• Implement a structured work breakdown structure aligned to deliverable milestones
• Apply proven quality gates at each stage to prevent defects and rework
• Maintain open communication with the Contracting Officer's Representative (COR)
• Provide weekly status reports with progress, issues, and upcoming milestones

KEY TECHNICAL REQUIREMENTS ADDRESSED
${reqList || '• All technical requirements will be addressed as specified in the solicitation'}

PHASE 3 — CLOSEOUT & TRANSITION
• Deliver all required documentation and final deliverables on schedule
• Conduct lessons-learned review with agency personnel
• Ensure seamless transition with zero disruption to mission operations
• Archive all project records per agency retention requirements

TOOLS & TECHNOLOGY
Our team will leverage industry-standard tools and methodologies to ensure efficiency, transparency, and compliance throughout the performance period. All systems and methods used will comply with applicable federal standards and ${c.agency} policies.`
}

function buildManagementPlan(input: SectionInput): string {
  const { c, b } = ctx(input)
  return `MANAGEMENT PLAN

${b.business_name} will deploy an experienced management team with clear lines of authority, accountability, and communication to ensure ${c.title} is executed to the highest standards for ${c.agency}.

ORGANIZATIONAL STRUCTURE
• Program Manager (PM): Single point of accountability responsible for all contract performance, quality, and stakeholder relationships
• Deputy PM / Technical Lead: Day-to-day execution oversight and technical quality assurance
• Administrative Lead: Contract administration, reporting, invoicing, and compliance

PROJECT MANAGEMENT APPROACH
We will employ a disciplined project management framework based on PMI best practices:

• Planning: Maintain a live project schedule with defined milestones and dependencies
• Execution: Weekly team standups and bi-weekly COR status meetings
• Monitoring: Real-time tracking of cost, schedule, and performance metrics
• Control: Formal change control process for scope modifications with COR approval

COMMUNICATION PLAN
| Audience | Format | Frequency |
|----------|--------|-----------|
| COR / COTR | Status Report | Weekly |
| Contracting Officer | Monthly Report | Monthly |
| Internal Team | Standup | Daily |
| Agency Leadership | Briefing | Quarterly |

RISK MANAGEMENT
${b.business_name} uses a proactive risk management approach:
1. Identify risks at project initiation and throughout performance
2. Assess likelihood and impact for each identified risk
3. Develop mitigation strategies before risks become issues
4. Report and escalate material risks to the COR immediately

SUBCONTRACTOR OVERSIGHT (IF APPLICABLE)
All subcontractors will be held to the same performance standards as ${b.business_name} prime team members, with regular performance reviews and quality audits.`
}

function buildStaffingPlan(input: SectionInput): string {
  const { c, b, certList } = ctx(input)
  return `STAFFING PLAN

${b.business_name} will staff this contract with a qualified, experienced team that possesses the skills, certifications, and dedication required to fulfill all requirements of ${c.title}.

KEY PERSONNEL

Position 1: Program Manager
• Education: Bachelor's degree in relevant field (Master's preferred)
• Experience: 8+ years managing government contracts of similar scope and complexity
• Certifications: PMP or equivalent project management certification
• Role: Overall accountability for contract performance, COR liaison, reporting

Position 2: Technical Lead / Subject Matter Expert
• Education: Bachelor's degree in relevant technical discipline
• Experience: 6+ years of hands-on technical experience in ${b.industry}
• Certifications: Relevant technical certifications (${certList})
• Role: Technical quality assurance, problem resolution, innovation

Position 3: Administrative / Logistics Coordinator
• Education: Bachelor's degree in Business Administration or related field
• Experience: 4+ years supporting government contracts
• Role: Contract administration, reporting, scheduling, records management

STAFFING STRATEGY
${b.business_name} maintains a deep bench of pre-qualified professionals to ensure:
• Rapid mobilization without delays in contract start
• Continuity of coverage for all key positions
• No single point of failure in critical roles
• Scalability to meet surge requirements

TEAM RETENTION & CONTINUITY
Our team retention strategy includes competitive compensation, professional development investments, and a culture of mission-focused excellence. We commit to notifying ${c.agency} within 30 days of any planned personnel changes in key positions, per FAR requirements.

CLEARANCE REQUIREMENTS
${b.business_name} will ensure all personnel assigned to this contract hold the appropriate background investigations and clearances required by ${c.agency} prior to commencing work.`
}

function buildQualityControl(input: SectionInput): string {
  const { c, b } = ctx(input)
  return `QUALITY CONTROL PLAN

${b.business_name} is committed to delivering ${c.title} at the highest quality standards. Our Quality Control (QC) Plan establishes the processes, metrics, and oversight mechanisms to ensure consistent, compliant, and excellent performance.

QUALITY MANAGEMENT FRAMEWORK
Our quality approach is built on three pillars:
1. Prevention — Build quality into work processes rather than inspect it in afterward
2. Detection — Systematic review and testing to catch defects before delivery
3. Correction — Rapid root-cause analysis and corrective action when issues arise

QUALITY CONTROL PROCEDURES

Step 1: Pre-Work Planning
• Review all requirements and acceptance criteria before each work order or deliverable
• Assign qualified personnel with appropriate experience and training
• Identify quality checkpoints and inspection criteria

Step 2: In-Process Inspection
• Supervisory review of work-in-progress against defined standards
• Peer review of all deliverables before submission to the government
• Documentation of all inspections in the QC log

Step 3: Final Inspection & Acceptance
• Formal pre-submission review by the QC Manager
• Verification of compliance with all technical requirements
• Documentation retained for government audit

PERFORMANCE METRICS
| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| On-time delivery | 100% | Schedule tracking |
| Defect rate | < 2% | Inspection log |
| Government complaints | Zero | COR feedback |
| Rework rate | < 5% | Cost accounting |

CORRECTIVE ACTION PROCESS
Any deficiency identified — by our team or by ${c.agency} — will be addressed through a formal corrective action process within 24 hours of identification, with root-cause analysis and preventive measures implemented within 5 business days.`
}

function buildPastPerformance(input: SectionInput): string {
  const { c, b, certList } = ctx(input)
  return `PAST PERFORMANCE

${b.business_name} provides the following references demonstrating our relevant experience delivering contracts similar in size, scope, and complexity to ${c.title}. All references may be contacted to verify performance.

─────────────────────────────────────────────────────────────
REFERENCE 1
─────────────────────────────────────────────────────────────
Contract Title:    [Title of Similar Contract]
Agency / Customer: [Federal Agency or Commercial Customer]
Contract Number:   [GS-XXXX-XXXX or equivalent]
Contract Value:    $[X,XXX,XXX]
Period of Performance: [MM/YYYY – MM/YYYY]
Contract Type:     [FFP / T&M / CPFF]

Point of Contact:
  Name:  [Contracting Officer / COR Name]
  Title: [Title]
  Phone: [Phone Number]
  Email: [Email Address]

Description of Work:
Provided [description of services/products delivered] in support of [agency mission area]. Work included [specific technical activities that parallel this solicitation's requirements].

Key Outcomes:
• Completed all deliverables [X days] ahead of schedule
• Achieved [XX]% quality acceptance rate with zero rework requests
• Received outstanding/excellent CPARS rating
• [Quantified outcome demonstrating mission impact]

Relevance to Current Requirement:
This effort directly demonstrates our capability to perform ${c.title} because [specific parallel].

─────────────────────────────────────────────────────────────
REFERENCE 2
─────────────────────────────────────────────────────────────
Contract Title:    [Title of Second Similar Contract]
Agency / Customer: [Second Agency / Customer]
Contract Number:   [Contract Number]
Contract Value:    $[X,XXX,XXX]
Period of Performance: [MM/YYYY – MM/YYYY]

Point of Contact:
  Name:  [Name]
  Phone: [Phone Number]
  Email: [Email Address]

Description of Work:
Delivered [description of services] to support [mission]. Scope included ${b.industry}-related activities with ${certList} compliance requirements.

Key Outcomes:
• [Quantified outcome 1]
• [Quantified outcome 2]
• [Award or recognition received]

─────────────────────────────────────────────────────────────
REFERENCE 3
─────────────────────────────────────────────────────────────
Contract Title:    [Title of Third Similar Contract]
Agency / Customer: [Third Agency / Customer]
Contract Number:   [Contract Number]
Contract Value:    $[X,XXX,XXX]
Period of Performance: [MM/YYYY – MM/YYYY]

Point of Contact:
  Name:  [Name]
  Phone: [Phone Number]
  Email: [Email Address]

Description of Work:
[Description of third reference with parallel requirements to ${c.title}.]

Key Outcomes:
• [Key achievement 1]
• [Key achievement 2]

NOTE: Replace all bracketed fields with actual contract data before submission. CPARS reports and past performance questionnaires may be attached as appendices.`
}

function buildPricingNarrative(input: SectionInput): string {
  const { c, b } = ctx(input)
  const valueMin = c.value_min ? `$${c.value_min.toLocaleString()}` : 'TBD'
  const valueMax = c.value_max ? `$${c.value_max.toLocaleString()}` : 'TBD'
  return `PRICING NARRATIVE

${b.business_name} has developed a competitive, transparent, and fair price for ${c.title} based on a thorough analysis of requirements, industry rates, and our operational experience. Our pricing reflects best value to the government — not merely the lowest possible cost.

ESTIMATED CONTRACT VALUE RANGE
This solicitation is estimated at ${valueMin} to ${valueMax}. Our detailed pricing will be submitted on the required pricing schedule.

COST BASIS & METHODOLOGY
Our pricing is built from the ground up using direct, verifiable cost elements:

1. LABOR COSTS
   • Direct labor rates are based on current market data (Bureau of Labor Statistics, comparable contracts)
   • Rates reflect required experience levels and relevant clearances
   • Benefits and fringe are loaded at [XX]% of direct labor (consistent with company benefit programs)

2. OTHER DIRECT COSTS (ODCs)
   • Materials and supplies: Based on GSA schedule pricing and three-quote requirement where applicable
   • Travel: Computed using current GSA per diem rates (no premium surcharges)
   • Equipment: Rented or government-furnished where possible to minimize cost

3. INDIRECT RATES
   • Overhead: [XX]% (negotiated rate or provisional, subject to audit)
   • G&A: [XX]%
   • Fringe: [XX]%
   All rates are consistent with ${b.business_name}'s negotiated or forward pricing rates.

4. PROFIT / FEE
   Our proposed fee of [X]% reflects the complexity, risk, and investment associated with this work. We believe this is fair and reasonable in the context of comparable awards.

VALUE FOR MONEY
${b.business_name}'s price is justified by:
• Experienced personnel who deliver correct results the first time — reducing rework cost
• Efficient management structure with low overhead burden
• Existing infrastructure, tools, and processes that avoid startup costs
• ${b.years_in_business} years of operational efficiency gains passed to the government

SMALL BUSINESS COMMITMENT
[If applicable] As a ${(b.certifications ?? []).join('/')} small business, our pricing reflects the cost efficiencies of a lean, mission-focused organization. We commit to maximizing small business participation throughout performance.`
}

function buildCoverLetter(input: SectionInput): string {
  const { c, b, solNum } = ctx(input)
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  return `[Date: ${today}]

[Contracting Officer Name]
Contracting Officer
${c.agency}
[Address Line 1]
[City, State ZIP]

Re: Proposal Submission — ${c.title}${solNum}

Dear [Contracting Officer Name]:

${b.business_name} is pleased to submit this proposal in response to the above-referenced solicitation. We have carefully reviewed all solicitation documents including the Statement of Work, Section L (Instructions), Section M (Evaluation Criteria), and all amendments, and we certify that our proposal is fully compliant with all requirements.

${b.business_name}, headquartered in ${b.city}, ${b.state}, is a qualified ${b.industry} firm with ${b.years_in_business} years of demonstrated experience supporting government clients. We are fully licensed, insured, and in good standing with all applicable regulatory requirements. Our proposal reflects our genuine enthusiasm for supporting ${c.agency}'s mission and our confidence that we are the right partner for this work.

PROPOSAL CONTENTS
Our proposal consists of the following volumes:
  Volume I:  Technical Proposal
  Volume II: Management Proposal
  Volume III: Past Performance
  Volume IV: Price/Cost Proposal

CERTIFICATIONS & REPRESENTATIONS
By submission of this proposal, ${b.business_name} certifies that:
• All information provided is accurate, current, and complete to the best of our knowledge
• We have not engaged in any prohibited communications during the solicitation period
• We acknowledge all solicitation amendments issued through the closing date
• We are registered and current in SAM.gov

POINT OF CONTACT
For questions regarding this proposal, please contact:

  Name:    [Authorized Negotiator Name]
  Title:   [Title]
  Phone:   [Phone Number]
  Email:   [Email Address]
  Address: ${b.city}, ${b.state}

We appreciate the opportunity to compete for this work and look forward to a favorable review of our proposal. ${b.business_name} is prepared to begin performance immediately upon award.

Respectfully submitted,

[Authorized Official Signature]

[Authorized Official Name]
[Title]
${b.business_name}
[Date]`
}

function buildComplianceMatrix(input: SectionInput): string {
  const { c } = ctx(input)
  return `COMPLIANCE MATRIX — ${c.title}

This matrix maps each solicitation requirement to the corresponding section of our proposal and confirms compliance. Contracting Officers and evaluators should use this matrix to quickly locate our response to each RFP element.

SECTION L — INSTRUCTIONS TO OFFERORS

| Requirement | Compliant | Proposal Location |
|-------------|-----------|------------------|
| L.1 — Proposal Format & Page Limits | YES | Cover Letter; see Volume headers |
| L.2 — Submission Instructions | YES | Submitted per instructions |
| L.3 — Technical Volume Requirements | YES | Volume I — Technical Approach |
| L.4 — Management Volume Requirements | YES | Volume II — Management Plan |
| L.5 — Past Performance Requirements | YES | Volume III — Past Performance |
| L.6 — Price/Cost Volume Requirements | YES | Volume IV — Pricing Schedule |
| L.7 — SAM.gov Registration | YES | Active; UEI: [XXXXXXXXXX] |
| L.8 — Representations & Certifications | YES | Section K — attached |

SECTION M — EVALUATION CRITERIA

| Evaluation Factor | Weight | Compliant | Proposal Location |
|-------------------|--------|-----------|------------------|
| Technical Approach | [XX]% | YES | Volume I, Section 3 |
| Management Capability | [XX]% | YES | Volume II, Section 4 |
| Past Performance | [XX]% | YES | Volume III, Section 5 |
| Price / Cost | [XX]% | YES | Volume IV, Tab 1 |

STATEMENT OF WORK — KEY REQUIREMENTS

| SOW Section | Requirement Summary | Compliant | Proposal Reference |
|-------------|--------------------|-----------|--------------------|
| SOW 1.0 | Scope of Work | YES | Volume I, pp. [X–X] |
| SOW 2.0 | Technical Requirements | YES | Volume I, pp. [X–X] |
| SOW 3.0 | Deliverables | YES | Volume I, Deliverables Table |
| SOW 4.0 | Place of Performance | YES | Volume II, Staffing Plan |
| SOW 5.0 | Period of Performance | YES | Volume II, Schedule |
| SOW 6.0 | Reporting Requirements | YES | Volume II, Mgmt Plan |
| SOW 7.0 | Security Requirements | YES | Volume II, Security section |
| SOW 8.0 | Quality Standards | YES | Volume II, QC Plan |

EXCEPTIONS / DEVIATIONS
${(c.requirements ?? []).length > 0
  ? '[ ] No exceptions or deviations from the requirements are taken. Our proposal is fully compliant.'
  : '[ ] No exceptions or deviations from the requirements are taken. Our proposal is fully compliant.'
}

NOTE: Update page references above with actual proposal page numbers before final submission. Add additional rows for any solicitation-specific requirements identified in your RFP review.`
}

// ── Dispatch ──────────────────────────────────────────────────

function buildTemplate(input: SectionInput): string {
  switch (input.sectionType) {
    case 'executive_summary':  return buildExecutiveSummary(input)
    case 'technical_approach': return buildTechnicalApproach(input)
    case 'management_plan':    return buildManagementPlan(input)
    case 'staffing_plan':      return buildStaffingPlan(input)
    case 'quality_control':    return buildQualityControl(input)
    case 'past_performance':   return buildPastPerformance(input)
    case 'pricing_narrative':  return buildPricingNarrative(input)
    case 'cover_letter':       return buildCoverLetter(input)
    case 'compliance_matrix':  return buildComplianceMatrix(input)
  }
}

// ── Anthropic path ────────────────────────────────────────────

function buildSystemPrompt(): string {
  return [
    'You are an expert federal government proposal writer with 20+ years of experience.',
    'Write professional, compliance-focused proposal sections using the context provided.',
    'Use clear headings and structure. Be specific and persuasive. Avoid generic filler.',
    'Output ONLY the section content — no explanations, preambles, or meta-commentary.',
    'Use plain text formatting with ALL-CAPS headings and bullet points where appropriate.',
  ].join(' ')
}

function buildUserPrompt(input: SectionInput): string {
  const { c, b, s, reqList } = ctx(input)
  const sectionTitle = SECTION_TITLES[input.sectionType]

  const lines: string[] = [
    `Write a complete "${sectionTitle}" section for a government proposal with this context:`,
    '',
    `CONTRACT: ${c.title}`,
    `AGENCY: ${c.agency}`,
    `SOLICITATION: ${c.solicitation_number ?? 'N/A'}`,
    `DESCRIPTION: ${c.description?.slice(0, 400) ?? 'N/A'}`,
    `KEY REQUIREMENTS:\n${reqList || 'See solicitation'}`,
    '',
    `COMPANY: ${b.business_name}`,
    `LOCATION: ${b.city}, ${b.state}`,
    `INDUSTRY: ${b.industry}`,
    `YEARS IN BUSINESS: ${b.years_in_business}`,
    `CERTIFICATIONS: ${(b.certifications ?? []).join(', ') || 'None listed'}`,
    `NAICS CODES: ${(b.naics_codes ?? []).join(', ') || 'N/A'}`,
  ]

  if (s) {
    lines.push(``)
    lines.push(`PROPOSAL STRATEGY (${s.recommendation}, confidence ${s.confidence_score}%):`)
    if (s.strengths?.length)  lines.push(`STRENGTHS: ${s.strengths.slice(0, 3).join('; ')}`)
    if (s.weaknesses?.length) lines.push(`WEAKNESSES TO ADDRESS: ${s.weaknesses.slice(0, 2).join('; ')}`)
    if (s.pricing_guidance)   lines.push(`PRICING GUIDANCE: ${s.pricing_guidance}`)
  }

  lines.push(``)
  lines.push(`Write the complete ${sectionTitle} section now. Be professional, specific, and compelling.`)

  return lines.join('\n')
}

async function generateWithAI(apiKey: string, input: SectionInput): Promise<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      system:     buildSystemPrompt(),
      messages:   [{ role: 'user', content: buildUserPrompt(input) }],
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(`Anthropic ${resp.status}: ${txt.slice(0, 200)}`)
  }

  const data = await resp.json() as {
    content: Array<{ type: string; text: string }>
  }

  const text = data.content.find(b => b.type === 'text')?.text ?? ''
  if (!text) throw new Error('Anthropic returned empty content')
  return text.trim()
}

// ── Public API ────────────────────────────────────────────────

export async function generateProposalSection(input: SectionInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    try {
      return await generateWithAI(apiKey, input)
    } catch (err) {
      console.error('[proposal-section] Anthropic error, using template fallback:', err)
    }
  }
  return buildTemplate(input)
}
