import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { ALL_CONNECTORS } from '@/lib/connectors/sources/index'
import { runAll } from '@/lib/connectors/pipeline'

export const dynamic = 'force-dynamic'

// GET /api/import — dashboard status: sources, recent runs, today's stats
export async function GET() {
  const db = supabaseServer

  const sources = ALL_CONNECTORS.map((c) => ({
    slug:       c.slug,
    name:       c.name,
    type:       c.type,
    configured: c.isConfigured(),
  }))

  if (!db) {
    return NextResponse.json({
      supabaseConfigured: false,
      sources,
      stats:        { contractsToday: 0, jobsToday: 0, failedToday: 0, newContractsToday: 0 },
      recentJobs:   [],
      newContracts: [],
    })
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const iso = todayStart.toISOString()

  const [
    { count: contractsToday },
    { count: jobsToday },
    { count: failedToday },
    { data: recentJobsRaw },
    { data: newContractsRaw },
    { data: sourcesDb },
  ] = await Promise.all([
    db.from('contracts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', iso),
    db.from('contract_import_runs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', iso),
    db.from('contract_import_runs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', iso),
    db.from('contract_import_runs')
      .select('*, source:contract_sources(slug, name, source_type)')
      .order('created_at', { ascending: false })
      .limit(20),
    db.from('contracts')
      .select('id, title, agency, due_date, naics_codes, created_at, source:contract_sources(name)')
      .gte('created_at', iso)
      .order('created_at', { ascending: false })
      .limit(20),
    db.from('contract_sources')
      .select('slug, enabled'),
  ])

  const sourceMap = Object.fromEntries(
    (sourcesDb ?? []).map((s: { slug: string; enabled: boolean }) => [s.slug, s])
  )

  const enrichedSources = sources.map((s) => ({
    ...s,
    lastRunAt: null as string | null,
    enabled:   sourceMap[s.slug]?.enabled ?? true,
  }))

  return NextResponse.json({
    supabaseConfigured: true,
    sources: enrichedSources,
    stats: {
      contractsToday:    contractsToday    ?? 0,
      jobsToday:         jobsToday         ?? 0,
      failedToday:       failedToday       ?? 0,
      newContractsToday: contractsToday    ?? 0,
    },
    recentJobs:   recentJobsRaw   ?? [],
    newContracts: newContractsRaw ?? [],
  })
}

// POST /api/import — run all imports
export async function POST() {
  try {
    const results = await runAll()
    return NextResponse.json({ ok: true, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
