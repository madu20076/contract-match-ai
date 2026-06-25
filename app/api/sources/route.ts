import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { ALL_CONNECTORS } from '@/lib/connectors/sources/index'

export const dynamic = 'force-dynamic'

type RunRow = {
  source_id: string
  status: string
  completed_at: string | null
  contracts_imported: number
  contract_sources: { slug: string } | { slug: string }[] | null
}

function slugFromRow(cs: RunRow['contract_sources']): string | undefined {
  if (!cs) return undefined
  return Array.isArray(cs) ? cs[0]?.slug : cs.slug
}

// GET /api/sources — all sources with last run stats, contract counts, and today's imports
export async function GET() {
  const db = supabaseServer

  const baseList = ALL_CONNECTORS.map((c) => ({
    slug:              c.slug,
    name:              c.name,
    type:              c.type,
    configured:        c.isConfigured(),
    live:              c.slug === 'samgov' ? !!process.env.SAMGOV_API_KEY : false,
    enabled:           true,
    lastRunAt:         null as string | null,
    lastStatus:        null as string | null,
    contractsImported: 0,
    importedToday:     0,
    totalContracts:    0,
  }))

  if (!db) {
    return NextResponse.json({ supabaseConfigured: false, sources: baseList })
  }

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const [
    { data: dbSources },
    { data: latestRuns },
    { data: todayRuns },
    { data: contractCounts },
  ] = await Promise.all([
    db.from('contract_sources').select('slug, name, enabled'),
    db.from('contract_import_runs')
      .select('source_id, status, completed_at, contracts_imported, contract_sources(slug)')
      .order('started_at', { ascending: false })
      .limit(100),
    db.from('contract_import_runs')
      .select('contracts_imported, contract_sources(slug)')
      .gte('started_at', todayStart.toISOString())
      .eq('status', 'completed'),
    db.from('contracts')
      .select('source_name')
      .not('source_name', 'is', null),
  ])

  // slug → DB source
  const sourceMap = Object.fromEntries(
    (dbSources ?? []).map((s: { slug: string; enabled: boolean }) => [s.slug, s])
  )

  // slug → most recent run
  const runMap: Record<string, RunRow> = {}
  for (const run of (latestRuns ?? []) as unknown as RunRow[]) {
    const slug = slugFromRow(run.contract_sources)
    if (slug && !runMap[slug]) runMap[slug] = run
  }

  // slug → contracts imported today
  const todayMap: Record<string, number> = {}
  for (const run of (todayRuns ?? []) as unknown as RunRow[]) {
    const slug = slugFromRow(run.contract_sources)
    if (slug) todayMap[slug] = (todayMap[slug] ?? 0) + (run.contracts_imported ?? 0)
  }

  // source_name → total contracts in DB
  const countMap: Record<string, number> = {}
  for (const row of contractCounts ?? []) {
    const name = (row as { source_name: string }).source_name
    countMap[name] = (countMap[name] ?? 0) + 1
  }

  const sources = baseList.map((s) => {
    const dbSrc = sourceMap[s.slug]
    const run   = runMap[s.slug]
    return {
      ...s,
      enabled:           dbSrc?.enabled ?? true,
      lastRunAt:         run?.completed_at ?? null,
      lastStatus:        run?.status ?? null,
      contractsImported: run?.contracts_imported ?? 0,
      importedToday:     todayMap[s.slug] ?? 0,
      totalContracts:    countMap[s.name] ?? 0,
    }
  })

  return NextResponse.json({ supabaseConfigured: true, sources })
}

// PATCH /api/sources — toggle enabled state
export async function PATCH(req: NextRequest) {
  const db = supabaseServer
  if (!db) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const body = (await req.json()) as { slug: string; enabled: boolean }
  if (!body.slug || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'slug and enabled required' }, { status: 400 })
  }

  const { error } = await db
    .from('contract_sources')
    .update({ enabled: body.enabled })
    .eq('slug', body.slug)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
