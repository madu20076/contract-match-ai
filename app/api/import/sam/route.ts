import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { runConnectorBySlug } from '@/lib/connectors/pipeline'
import type { ImportFilters } from '@/lib/connectors/normalizer'

export const dynamic = 'force-dynamic'

// GET /api/import/sam — last run status + stats
export async function GET() {
  const db = supabaseServer

  if (!db) {
    return NextResponse.json({
      configured: false, live: false, message: 'Supabase not configured', lastRun: null,
    })
  }

  const [lastRunRes, totalRes] = await Promise.all([
    db.from('contract_import_runs')
      .select('id, status, started_at, completed_at, contracts_imported, error_message, contract_sources!inner(slug)')
      .eq('contract_sources.slug', 'samgov')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('contracts')
      .select('*', { count: 'exact', head: true })
      .eq('source_name', 'SAM.gov'),
  ])

  // contracts imported today
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const { data: todayRuns } = await db
    .from('contract_import_runs')
    .select('contracts_imported, contract_sources!inner(slug)')
    .eq('contract_sources.slug', 'samgov')
    .gte('started_at', todayStart.toISOString())
    .eq('status', 'completed')

  const importedToday = (todayRuns ?? []).reduce(
    (sum, r) => sum + ((r as { contracts_imported: number }).contracts_imported ?? 0), 0
  )

  return NextResponse.json({
    configured:      true,
    live:            !!process.env.SAMGOV_API_KEY,
    totalContracts:  totalRes.count ?? 0,
    importedToday,
    lastRun:         lastRunRes.data ?? null,
  })
}

// POST /api/import/sam — run SAM.gov import with optional filters
export async function POST(req: NextRequest) {
  let filters: ImportFilters | undefined

  try {
    const body = await req.json() as Record<string, string | undefined>
    const f: ImportFilters = {
      naicsCode:  body.naicsCode  || undefined,
      agency:     body.agency     || undefined,
      setAside:   body.setAside   || undefined,
      postedFrom: body.postedFrom || undefined,
      postedTo:   body.postedTo   || undefined,
      keyword:    body.keyword    || undefined,
    }
    if (Object.values(f).some(v => v !== undefined)) filters = f
  } catch {
    // no body — run without filters
  }

  try {
    const result = await runConnectorBySlug('samgov', { filters })
    const contractsImported = result.contracts_inserted + result.contracts_updated

    return NextResponse.json({
      ok:                 true,
      contracts_imported: contractsImported,
      contracts_found:    result.contracts_found,
      contracts_inserted: result.contracts_inserted,
      contracts_updated:  result.contracts_updated,
      skipped:            result.skipped,
      errors:             result.errors,
      duration_ms:        result.duration_ms,
      filters_applied:    result.filters_applied ?? false,
      live:               !!process.env.SAMGOV_API_KEY,
      result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
