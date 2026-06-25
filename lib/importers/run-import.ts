import { supabaseServer } from '@/lib/supabase-server'
import type { SourceConnector, ImportResult, ImportFilters, NormalizedContract } from './types'
import { sam }          from './sam'
import { dibbs }        from './dibbs'
import { texas }        from './texas'
import { houston }      from './houston'
import { harrisCounty } from './harris-county'

export const ALL_CONNECTORS: SourceConnector[] = [dibbs, sam, texas, houston, harrisCounty]

// ── Public API ───────────────────────────────────────────────

export interface RunOptions {
  since?:   Date
  filters?: ImportFilters
}

export async function runAllImports(): Promise<ImportResult[]> {
  const results: ImportResult[] = []
  for (const connector of ALL_CONNECTORS) {
    results.push(await runImportForConnector(connector))
  }
  return results
}

export async function runImportForSource(slug: string, options?: RunOptions): Promise<ImportResult> {
  const connector = ALL_CONNECTORS.find((c) => c.slug === slug)
  if (!connector) throw new Error(`Unknown source slug: "${slug}"`)
  return runImportForConnector(connector, options)
}

// ── Internal ─────────────────────────────────────────────────

async function runImportForConnector(
  connector: SourceConnector,
  options?: RunOptions,
): Promise<ImportResult> {
  const start = Date.now()
  const filtersApplied = !!(
    options?.filters &&
    Object.values(options.filters).some(v => v !== undefined && v !== '')
  )

  const result: ImportResult = {
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
    result.errors.push('Source not configured — check required env vars')
    result.duration_ms = Date.now() - start
    return result
  }

  const db = supabaseServer

  // Resolve source UUID + create import run record
  let sourceId: string | undefined
  let runId:    string | undefined

  if (db) {
    const { data: src } = await db
      .from('contract_sources')
      .select('id')
      .eq('slug', connector.slug)
      .single()
    sourceId = src?.id ?? undefined

    if (sourceId) {
      const { data: run } = await db
        .from('contract_import_runs')
        .insert({ source_id: sourceId, status: 'running', started_at: new Date().toISOString() })
        .select('id')
        .single()
      runId = run?.id ?? undefined
    }
  }

  try {
    // Default window: 30 days; can be overridden via options.since
    const since = options?.since ?? new Date(Date.now() - 30 * 86_400_000)
    const rawContracts = await connector.fetchRaw(since, options?.filters)
    result.contracts_found = rawContracts.length

    for (const raw of rawContracts) {
      try {
        const normalized = connector.normalize(raw)
        if (!normalized) { result.skipped++; continue }

        if (db) {
          const outcome = await upsertContract(db, normalized)
          if (outcome === 'inserted')     result.contracts_inserted++
          else if (outcome === 'updated') result.contracts_updated++
          else                            result.skipped++
        } else {
          result.contracts_inserted++ // dry-run when Supabase not configured
        }
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : String(err))
      }
    }

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
  return result
}

// ── Upsert ───────────────────────────────────────────────────

type UpsertOutcome = 'inserted' | 'updated' | 'skipped'

async function upsertContract(
  db: NonNullable<typeof supabaseServer>,
  normalized: NormalizedContract,
): Promise<UpsertOutcome> {
  const sourceName = normalized.source_name ?? normalized.source_slug

  const { data: existing } = await db
    .from('contracts')
    .select('id')
    .eq('source_name',        sourceName)
    .eq('source_contract_id', normalized.external_id)
    .maybeSingle()

  const { external_id, ...fields } = normalized
  const payload: Record<string, unknown> = {
    ...fields as Record<string, unknown>,
    source_contract_id: external_id,
    last_imported_at:   new Date().toISOString(),
  }
  delete payload.source_slug

  let dbError: { message: string } | null = null

  if (existing?.id) {
    const res = await db.from('contracts').update(payload).eq('id', existing.id)
    dbError = res.error
  } else {
    const res = await db.from('contracts').insert(payload)
    dbError = res.error
  }

  if (dbError) throw new Error(dbError.message)
  return existing?.id ? 'updated' : 'inserted'
}
