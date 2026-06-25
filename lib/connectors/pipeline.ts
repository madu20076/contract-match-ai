import { supabaseServer } from '@/lib/supabase-server'
import { enqueueBriefJob } from '@/lib/jobs/brief-generator'
import type { ProcurementConnector, FetchOptions, PipelineResult } from './connector'
import type { NormalizedOpportunity } from './normalizer'
import { ALL_CONNECTORS } from './sources/index'

// ── Public API ────────────────────────────────────────────────

export async function runConnector(
  connector: ProcurementConnector,
  options?:  FetchOptions,
): Promise<PipelineResult> {
  const start = Date.now()
  const filtersApplied = !!(
    options?.filters &&
    Object.values(options.filters).some((v) => v !== undefined && v !== '')
  )

  const result: PipelineResult = {
    source_slug:        connector.slug,
    source_name:        connector.name,
    contracts_found:    0,
    contracts_inserted: 0,
    contracts_updated:  0,
    skipped:            0,
    errors:             [],
    duration_ms:        0,
    filters_applied:    filtersApplied,
  }

  if (!connector.isConfigured()) {
    result.errors.push('Connector not configured — check env vars')
    result.duration_ms = Date.now() - start
    return result
  }

  const db = supabaseServer

  // Create import run record
  let runId: string | undefined

  if (db) {
    const { data: src } = await db
      .from('contract_sources')
      .select('id')
      .eq('slug', connector.slug)
      .single()

    if (src?.id) {
      const { data: run } = await db
        .from('contract_import_runs')
        .insert({ source_id: src.id, status: 'running', started_at: new Date().toISOString() })
        .select('id')
        .single()
      runId = run?.id ?? undefined
    }
  }

  try {
    // Step 1: Connector pipeline — fetch → parse → normalize → validate
    const connectorResult = await connector.run(options)
    result.contracts_found = connectorResult.contracts_found
    result.errors.push(...connectorResult.errors)

    // Step 2: Database upsert + enqueue brief jobs
    for (const opp of connectorResult.opportunities) {
      try {
        if (db) {
          const { outcome, id } = await upsertOpportunity(db, opp)
          if (outcome === 'inserted')     result.contracts_inserted++
          else if (outcome === 'updated') result.contracts_updated++
          else                            result.skipped++

          // Step 3: Enqueue AI brief generation (non-blocking DB insert)
          if (id && outcome !== 'skipped') {
            await enqueueBriefJob(id)
          }
        } else {
          result.contracts_inserted++ // dry-run: Supabase not configured
        }
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : String(err))
      }
    }

    // Step 3: Update import run record
    if (db && runId) {
      await db.from('contract_import_runs').update({
        status:             'completed',
        completed_at:       new Date().toISOString(),
        contracts_imported: result.contracts_inserted + result.contracts_updated,
      }).eq('id', runId)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result.errors.push(message)

    if (db && runId) {
      await db.from('contract_import_runs').update({
        status:        'failed',
        completed_at:  new Date().toISOString(),
        error_message: message.slice(0, 2000),
      }).eq('id', runId)
    }
  }

  result.duration_ms = Date.now() - start
  result.run_id      = runId
  return result
}

export async function runConnectorBySlug(
  slug:    string,
  options?: FetchOptions,
): Promise<PipelineResult> {
  const connector = ALL_CONNECTORS.find((c) => c.slug === slug)
  if (!connector) throw new Error(`Unknown connector slug: "${slug}"`)
  return runConnector(connector, options)
}

export async function runAll(options?: { since?: Date }): Promise<PipelineResult[]> {
  const results: PipelineResult[] = []
  for (const connector of ALL_CONNECTORS) {
    results.push(await runConnector(connector, options))
  }
  return results
}

// ── Database upsert ───────────────────────────────────────────

type UpsertOutcome = 'inserted' | 'updated' | 'skipped'

interface UpsertResult {
  outcome: UpsertOutcome
  id:      string | null
}

async function upsertOpportunity(
  db:  NonNullable<typeof supabaseServer>,
  opp: NormalizedOpportunity,
): Promise<UpsertResult> {
  const { data: existing } = await db
    .from('contracts')
    .select('id')
    .eq('source_name',        opp.source_name)
    .eq('source_contract_id', opp.external_id)
    .maybeSingle()

  // Strip source_slug and external_id — not DB columns
  const { external_id, ...fields } = opp
  const payload: Record<string, unknown> = {
    ...fields as Record<string, unknown>,
    source_contract_id: external_id,
    last_imported_at:   new Date().toISOString(),
  }
  delete payload.source_slug

  if (existing?.id) {
    const res = await db.from('contracts').update(payload).eq('id', existing.id)
    if (res.error) throw new Error(res.error.message)
    return { outcome: 'updated', id: existing.id }
  }

  const res = await db.from('contracts').insert(payload).select('id').single()
  if (res.error) throw new Error(res.error.message)
  return { outcome: 'inserted', id: (res.data as { id: string } | null)?.id ?? null }
}
