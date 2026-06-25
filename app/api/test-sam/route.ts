import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface SamOpportunity {
  noticeId?: string
  title?: string
  solicitationNumber?: string
  naicsCode?: string
  responseDeadLine?: string
  postedDate?: string
  setAside?: string
  organizationHierarchy?: { level: string; name: string }[]
  placeOfPerformance?: { city?: { name: string }; state?: { code: string } }
  awardFloor?: number
  awardCeil?: number
}

interface SamApiResponse {
  totalRecords?: number
  opportunitiesData?: SamOpportunity[]
  error?: { code?: string; message?: string }
  title?: string   // error shape from SAM.gov
  status?: number
}

function mmddyyyy(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

function formatDate(s?: string): string | null {
  if (!s) return null
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function fmtMoney(n?: number): string | null {
  if (!n) return null
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : `$${(n / 1_000).toFixed(0)}K`
}

// Mock response when no API key is configured
function mockResponse() {
  return NextResponse.json({
    reachable:    false,
    live:         false,
    mock:         true,
    testedAt:     new Date().toISOString(),
    message:      'No SAMGOV_API_KEY found — returning mock data. Add key to .env.local to test live connectivity.',
    totalRecords: 6,
    opportunities: [
      { title: 'IT Infrastructure Maintenance and Support Services', agency: 'Dept of Veterans Affairs',    solicitationNumber: 'VA-36C10X26R0042',    naicsCode: '541512', dueDate: '2026-08-15', setAside: 'SDVOSB', valueRange: '$250K–$500K' },
      { title: 'Cybersecurity Assessment and Continuous Monitoring', agency: 'Dept of Homeland Security',   solicitationNumber: 'DHS-26-B-00173',        naicsCode: '541519', dueDate: '2026-07-30', setAside: '8(a)',   valueRange: '$500K–$2M'  },
      { title: 'General Construction and Renovation — Federal Buildings', agency: 'General Services Administration', solicitationNumber: 'GS-04P-26-HJ-C-0019', naicsCode: '236220', dueDate: '2026-09-01', setAside: 'HUBZone', valueRange: '$1M–$5M'   },
      { title: 'Healthcare Staffing and Workforce Solutions',         agency: 'Dept of Health and Human Services', solicitationNumber: 'HHS-2026-NIH-SS-0047',  naicsCode: '561320', dueDate: '2026-08-01', setAside: 'WOSB',  valueRange: '$750K–$3M'  },
      { title: 'Logistics and Supply Chain Support',                  agency: 'Defense Logistics Agency',   solicitationNumber: 'SP4705-26-R-0091',       naicsCode: '488510', dueDate: '2026-08-22', setAside: 'SDVOSB', valueRange: '$2M–$8M'    },
    ],
    errors: [],
  })
}

export async function GET() {
  const apiKey = process.env.SAMGOV_API_KEY
  if (!apiKey) return mockResponse()

  const now  = new Date()
  const from = new Date(now.getTime() - 30 * 86_400_000)

  const qs = new URLSearchParams({
    api_key:    apiKey,
    limit:      '10',
    offset:     '0',
    postedFrom: mmddyyyy(from),
    postedTo:   mmddyyyy(now),
    ptype:      'o,k,r,p',
    status:     'active',
  })

  const url = `https://api.sam.gov/opportunities/v2/search?${qs}`

  let res: Response
  try {
    res = await fetch(url, {
      cache:  'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      reachable:    false,
      live:         true,
      mock:         false,
      testedAt:     new Date().toISOString(),
      totalRecords: 0,
      opportunities: [],
      errors:        [`Network error: ${message}`],
    }, { status: 200 }) // always 200 so the UI can render the error inline
  }

  const rawText = await res.text()
  let json: SamApiResponse
  try {
    json = JSON.parse(rawText) as SamApiResponse
  } catch {
    return NextResponse.json({
      reachable:    false,
      live:         true,
      mock:         false,
      testedAt:     new Date().toISOString(),
      httpStatus:   res.status,
      totalRecords: 0,
      opportunities: [],
      errors:        [`SAM.gov returned non-JSON (HTTP ${res.status}): ${rawText.slice(0, 300)}`],
    }, { status: 200 })
  }

  // SAM.gov returns error shapes like { title: "...", status: 403, detail: "..." }
  if (!res.ok || json.error) {
    const errMsg = json.error?.message
      ?? (json as Record<string, unknown>).detail as string
      ?? (json as Record<string, unknown>).title as string
      ?? `HTTP ${res.status}`
    return NextResponse.json({
      reachable:    res.status !== 0,
      live:         true,
      mock:         false,
      testedAt:     new Date().toISOString(),
      httpStatus:   res.status,
      totalRecords: 0,
      opportunities: [],
      errors:        [errMsg],
    }, { status: 200 })
  }

  const opps = (json.opportunitiesData ?? []).slice(0, 5)

  const opportunities = opps.map((o) => {
    const hier   = o.organizationHierarchy ?? []
    const topOrg = hier.find((h) => h.level === 'Department') ?? hier[0]
    const agency = topOrg?.name ?? 'Federal Agency'
    const city   = o.placeOfPerformance?.city?.name ?? ''
    const state  = o.placeOfPerformance?.state?.code ?? ''
    const loc    = city && state ? `${city}, ${state}` : state || city || '—'
    const min    = fmtMoney(o.awardFloor)
    const max    = fmtMoney(o.awardCeil)
    const valueRange = min && max ? `${min}–${max}` : max ?? min ?? null

    return {
      title:              o.title ?? '(no title)',
      agency,
      location:           loc,
      solicitationNumber: o.solicitationNumber ?? o.noticeId ?? '—',
      naicsCode:          o.naicsCode ?? '—',
      dueDate:            formatDate(o.responseDeadLine) ?? '—',
      postedDate:         formatDate(o.postedDate) ?? '—',
      setAside:           o.setAside ?? null,
      valueRange,
    }
  })

  return NextResponse.json({
    reachable:    true,
    live:         true,
    mock:         false,
    testedAt:     new Date().toISOString(),
    httpStatus:   res.status,
    totalRecords: json.totalRecords ?? opps.length,
    opportunities,
    errors:        [],
  })
}
