import type { Contract, ProposalStrategy } from '@/types'

export interface TaskInput {
  workspace_id: string
  title:        string
  description?: string
  status:       'todo' | 'in_progress' | 'done'
  due_date?:    string
  section:      string
  priority:     'low' | 'medium' | 'high'
  sort_order:   number
}

function daysBefore(dueDate: string, n: number): string {
  const d = new Date(dueDate)
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function fmtMoney(n?: number): string {
  if (!n) return 'TBD'
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`
}

export function ruleBasedTasks(
  contract:    Contract,
  workspaceId: string,
): TaskInput[] {
  const due  = contract.due_date
  const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000)

  let order = 0
  const tasks: TaskInput[] = []

  function task(
    title:       string,
    section:     string,
    priority:    'low' | 'medium' | 'high',
    daysBeforeDue?: number,
    description?: string,
  ): TaskInput {
    const hasDue = daysBeforeDue !== undefined && days > daysBeforeDue
    return {
      workspace_id: workspaceId,
      title,
      description,
      status:     'todo',
      section,
      priority,
      due_date:   hasDue ? daysBefore(due, daysBeforeDue!) : undefined,
      sort_order: order++,
    }
  }

  // ── Solicitation Review ──────────────────────────────────────
  tasks.push(task('Download full solicitation and all attachments',          'Solicitation Review', 'high',   1))
  tasks.push(task('Read Statement of Work / Objectives thoroughly',          'Solicitation Review', 'high',   2))
  tasks.push(task('Extract and list all evaluation criteria',                'Solicitation Review', 'medium', 3))
  tasks.push(task('Identify all mandatory proposal requirements and formats','Solicitation Review', 'medium', 4))

  // ── Technical Approach ───────────────────────────────────────
  tasks.push(task('Develop technical approach outline',                       'Technical Approach', 'high',   Math.max(7,  Math.round(days * 0.5))))
  tasks.push(task('Draft technical volume / methodology section',             'Technical Approach', 'high',   Math.max(5,  Math.round(days * 0.35))))
  tasks.push(task('Identify key personnel and draft résumés / bios',         'Technical Approach', 'medium', Math.max(5,  Math.round(days * 0.3))))
  tasks.push(task('Develop management plan and staffing approach',            'Technical Approach', 'medium', Math.max(4,  Math.round(days * 0.25))))

  // ── Past Performance ─────────────────────────────────────────
  tasks.push(task('Identify 3 relevant past performance references',         'Past Performance', 'high',   Math.max(10, Math.round(days * 0.55))))
  tasks.push(task('Collect PPQs or CPARS from prior clients',                'Past Performance', 'medium', Math.max(8,  Math.round(days * 0.45))))
  tasks.push(task('Write past performance narratives for each reference',    'Past Performance', 'medium', Math.max(6,  Math.round(days * 0.3))))

  // ── Price & Cost ─────────────────────────────────────────────
  tasks.push(task('Research competitive pricing and government cost estimates','Price & Cost', 'high',  Math.max(10, Math.round(days * 0.55))))
  tasks.push(task('Build detailed cost breakdown (labor, ODCs, materials)',   'Price & Cost', 'high',  Math.max(5,  Math.round(days * 0.25))))
  tasks.push(task('Quality-check and finalize the price volume',              'Price & Cost', 'high',  7))

  // ── Compliance ───────────────────────────────────────────────
  tasks.push(task('Verify SAM.gov registration is active and up-to-date',    'Compliance', 'high', Math.min(days - 1, 5)))
  if (contract.certifications_required.length > 0) {
    tasks.push(task(
      `Confirm ${contract.certifications_required[0]} certification is current`,
      'Compliance', 'high', 5,
    ))
  }
  tasks.push(task('Complete Representations and Certifications (Reps & Certs)', 'Compliance', 'medium', 10))

  // ── Submission ───────────────────────────────────────────────
  tasks.push(task('Red-team / internal review of complete proposal',         'Submission', 'high', 10))
  tasks.push(task('Incorporate all review feedback',                         'Submission', 'high',  7))
  tasks.push(task('Final formatting and compliance check',                   'Submission', 'high',  3))
  tasks.push(task('Submit proposal through designated portal',               'Submission', 'high',  1))

  return tasks
}

async function buildAITasks(
  contract:    Contract,
  workspaceId: string,
  strategy?:   ProposalStrategy | null,
): Promise<TaskInput[]> {
  const days = Math.ceil((new Date(contract.due_date).getTime() - Date.now()) / 86_400_000)

  const prompt = `Generate a proposal preparation task list for this government contract bid.

CONTRACT
========
Title:      ${contract.title}
Agency:     ${contract.agency}
Value:      ${fmtMoney(contract.value_min)} - ${fmtMoney(contract.value_max)}
Due:        ${contract.due_date} (${days} days from today)
NAICS:      ${contract.naics_codes.join(', ')}
Set-asides: ${contract.certifications_required.join(', ') || 'Full and Open'}
${strategy ? `
BID STRATEGY
============
Recommendation: ${strategy.recommendation} (confidence: ${strategy.confidence_score}/100)
Strengths: ${strategy.strengths.slice(0, 2).join('; ')}
Docs needed: ${strategy.required_documents.slice(0, 4).join(', ')}
` : ''}
Return ONLY valid JSON array — no markdown, no prose:

[
  {
    "title": "short action-oriented task title",
    "section": "Solicitation Review | Technical Approach | Past Performance | Price & Cost | Compliance | Teaming | Submission",
    "priority": "high | medium | low",
    "days_before_due": <integer or null>,
    "description": "optional 1-sentence detail"
  }
]

Rules:
- 18-22 tasks total covering all sections
- Submission section: 4 tasks at 10, 7, 3, 1 days before deadline
- priority "high" for critical-path items
- "days_before_due" = days before the proposal deadline this task should be done (null = no specific date)`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      system:     'You are a government proposal preparation expert. Return only valid JSON.',
      messages:   [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(45_000),
  })

  if (!res.ok) throw new Error(`Anthropic ${res.status}`)

  const json = await res.json() as { content?: { type: string; text: string }[] }
  const text = json.content?.find(b => b.type === 'text')?.text ?? ''
  if (!text) throw new Error('Empty AI response')

  const clean = text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim()
  const raw   = JSON.parse(clean) as {
    title: string; section: string; priority: string
    days_before_due: number | null; description?: string
  }[]

  const totalDays = Math.ceil((new Date(contract.due_date).getTime() - Date.now()) / 86_400_000)
  const VALID_PRIORITIES = new Set(['low', 'medium', 'high'])

  return raw.map((item, i) => ({
    workspace_id: workspaceId,
    title:        item.title,
    description:  item.description,
    status:       'todo' as const,
    section:      item.section ?? 'General',
    priority:     (VALID_PRIORITIES.has(item.priority) ? item.priority : 'medium') as 'low' | 'medium' | 'high',
    due_date:     item.days_before_due != null && totalDays > item.days_before_due
      ? daysBefore(contract.due_date, item.days_before_due) : undefined,
    sort_order:   i,
  }))
}

export async function generateWorkspaceTasks(
  contract:    Contract,
  workspaceId: string,
  strategy?:   ProposalStrategy | null,
): Promise<TaskInput[]> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await buildAITasks(contract, workspaceId, strategy)
    } catch (err) {
      console.error('[generateWorkspaceTasks] AI failed:', err)
    }
  }
  return ruleBasedTasks(contract, workspaceId)
}
