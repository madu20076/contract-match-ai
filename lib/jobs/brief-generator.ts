import { supabaseServer } from '@/lib/supabase-server'
import { generateOpportunityBrief } from '@/lib/ai/opportunity-brief'
import type { Contract, OpportunityBrief } from '@/types'

// ── Enqueue ───────────────────────────────────────────────────

export async function enqueueBriefJob(contractId: string): Promise<void> {
  const db = supabaseServer
  if (!db) return

  // UPSERT so re-importing a contract resets the job to pending
  await db.from('opportunity_brief_jobs').upsert(
    { contract_id: contractId, status: 'pending', error_message: null, started_at: null, completed_at: null },
    { onConflict: 'contract_id' },
  )
}

// ── Queue stats ───────────────────────────────────────────────

export interface QueueStats {
  pending:       number
  processing:    number
  completed:     number
  failed:        number
  avgDurationMs: number | null
}

export async function getQueueStats(): Promise<QueueStats> {
  const db = supabaseServer
  if (!db) {
    return { pending: 0, processing: 0, completed: 0, failed: 0, avgDurationMs: null }
  }

  const { data } = await db
    .from('opportunity_brief_jobs')
    .select('status, started_at, completed_at')

  const rows = (data ?? []) as { status: string; started_at: string | null; completed_at: string | null }[]

  const stats: QueueStats = { pending: 0, processing: 0, completed: 0, failed: 0, avgDurationMs: null }
  const durations: number[] = []

  for (const row of rows) {
    if (row.status === 'pending')    stats.pending++
    if (row.status === 'processing') stats.processing++
    if (row.status === 'completed')  stats.completed++
    if (row.status === 'failed')     stats.failed++

    if (row.status === 'completed' && row.started_at && row.completed_at) {
      durations.push(new Date(row.completed_at).getTime() - new Date(row.started_at).getTime())
    }
  }

  if (durations.length > 0) {
    stats.avgDurationMs = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
  }

  return stats
}

// ── Process jobs ──────────────────────────────────────────────

export interface ProcessResult {
  processed: number
  failed:    number
  errors:    string[]
}

export async function processAllPending(limit = 20, retryFailed = false): Promise<ProcessResult> {
  const db = supabaseServer
  if (!db) return { processed: 0, failed: 0, errors: [] }

  const statuses = retryFailed ? ['pending', 'failed'] : ['pending']

  const { data: jobs } = await db
    .from('opportunity_brief_jobs')
    .select('id, contract_id')
    .in('status', statuses)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!jobs || jobs.length === 0) return { processed: 0, failed: 0, errors: [] }

  const result: ProcessResult = { processed: 0, failed: 0, errors: [] }

  for (const job of jobs as { id: string; contract_id: string }[]) {
    // Mark processing
    await db.from('opportunity_brief_jobs').update({
      status:     'processing',
      started_at: new Date().toISOString(),
    }).eq('id', job.id)

    try {
      // Load contract
      const { data: contractData } = await db
        .from('contracts')
        .select('*')
        .eq('id', job.contract_id)
        .single()

      if (!contractData) throw new Error(`Contract ${job.contract_id} not found`)

      const contract = contractData as Contract

      // Generate brief
      const brief = await generateOpportunityBrief(contract)

      // Upsert brief
      await saveBrief(db, brief)

      // Mark completed
      await db.from('opportunity_brief_jobs').update({
        status:       'completed',
        completed_at: new Date().toISOString(),
        error_message: null,
      }).eq('id', job.id)

      result.processed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`[${job.contract_id}] ${message}`)
      result.failed++

      await db.from('opportunity_brief_jobs').update({
        status:        'failed',
        completed_at:  new Date().toISOString(),
        error_message: message.slice(0, 2000),
      }).eq('id', job.id)
    }
  }

  return result
}

// ── Save brief ────────────────────────────────────────────────

async function saveBrief(
  db:    NonNullable<typeof supabaseServer>,
  brief: OpportunityBrief,
): Promise<void> {
  const payload = {
    contract_id:             brief.contract_id,
    summary:                 brief.summary,
    opportunity_type:        brief.opportunity_type,
    estimated_contract_size: brief.estimated_contract_size,
    fit_score:               brief.fit_score,
    win_probability:         brief.win_probability,
    proposal_complexity:     brief.proposal_complexity,
    competition_level:       brief.competition_level,
    required_certifications: brief.required_certifications,
    required_documents:      brief.required_documents,
    key_requirements:        brief.key_requirements,
    risks:                   brief.risks,
    recommended_actions:     brief.recommended_actions,
    timeline:                brief.timeline,
    generated_by:            brief.generated_by,
    generated_at:            new Date().toISOString(),
    updated_at:              new Date().toISOString(),
  }

  const { error } = await db.from('opportunity_briefs').upsert(payload, { onConflict: 'contract_id' })
  if (error) throw new Error(`Failed to save brief: ${error.message}`)
}

// ── Pending jobs listing (for admin page) ─────────────────────

export interface JobRow {
  id:           string
  contract_id:  string
  status:       string
  error_message: string | null
  created_at:   string
  started_at:   string | null
  completed_at: string | null
  contract_title?: string
}

export async function getRecentJobs(limit = 50): Promise<JobRow[]> {
  const db = supabaseServer
  if (!db) return []

  const { data } = await db
    .from('opportunity_brief_jobs')
    .select('*, contract:contracts(title)')
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as unknown as (JobRow & { contract: { title: string } | null })[]).map((r) => ({
    ...r,
    contract_title: r.contract?.title ?? '(unknown)',
  }))
}
