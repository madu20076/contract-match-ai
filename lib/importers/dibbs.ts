import type { SourceConnector, RawContract, NormalizedContract } from './types'

// DIBBS = Defense Internet Bid Board System (DLA)
// Portal: https://www.dibbs.bsm.dla.mil/
// Supply solicitations identified by NSN (National Stock Number) and FSC code.
// No public REST API — set DIBBS_ENABLED=true once a direct data feed is arranged.
// Without DIBBS_ENABLED, returns mock solicitations for development and demos.

// ── Mock data ────────────────────────────────────────────────

interface DibbsRecord {
  solicitationNumber: string
  nsn: string
  fscCode: string
  itemDescription: string
  purchasingOffice: string
  closingDate: string
  issueDate: string
  procurementType: string
  setAside?: string
  qty?: number
  unitOfIssue?: string
}

const MOCK_DIBBS: DibbsRecord[] = [
  {
    solicitationNumber: 'SPE4AX-26-Q-0847',
    nsn:               '1615-01-430-1290',
    fscCode:           '1615',
    itemDescription:   'Helicopter Rotor Blade Assembly — MIL-SPEC, Qty 12 EA',
    purchasingOffice:  'DLA Aviation',
    closingDate:       '2026-07-25',
    issueDate:         '2026-06-15',
    procurementType:   'Competitive',
    setAside:          'SDB',
    qty:               12,
    unitOfIssue:       'EA',
  },
  {
    solicitationNumber: 'SPE7M3-26-T-3491',
    nsn:               '5905-01-221-8477',
    fscCode:           '5905',
    itemDescription:   'Electronic Resistor Assembly — MIL-PRF-55182, Qty 500 EA',
    purchasingOffice:  'DLA Land and Maritime',
    closingDate:       '2026-08-10',
    issueDate:         '2026-06-20',
    procurementType:   'Sole Source',
    qty:               500,
    unitOfIssue:       'EA',
  },
  {
    solicitationNumber: 'SPE4A6-26-Q-2204',
    nsn:               '4320-01-158-3474',
    fscCode:           '4320',
    itemDescription:   'Hydraulic Pump, Aircraft — MIL-P-5518, Qty 6 EA',
    purchasingOffice:  'DLA Aviation',
    closingDate:       '2026-07-18',
    issueDate:         '2026-06-12',
    procurementType:   'Competitive',
    setAside:          'SB',
    qty:               6,
    unitOfIssue:       'EA',
  },
  {
    solicitationNumber: 'SPRBL1-26-Q-0392',
    nsn:               '6150-01-044-6543',
    fscCode:           '6150',
    itemDescription:   'Cable Assembly, Power — MIL-C-3432, Qty 200 EA',
    purchasingOffice:  'DLA Land and Maritime',
    closingDate:       '2026-08-05',
    issueDate:         '2026-06-22',
    procurementType:   'Competitive',
    qty:               200,
    unitOfIssue:       'EA',
  },
  {
    solicitationNumber: 'SPM8EJ-26-T-0714',
    nsn:               '8410-01-352-2786',
    fscCode:           '8410',
    itemDescription:   'Military Uniform Coat, All-Season — NSN 8410 series, Qty 1000 EA',
    purchasingOffice:  'DLA Troop Support',
    closingDate:       '2026-09-01',
    issueDate:         '2026-06-24',
    procurementType:   'Competitive',
    setAside:          'SDB',
    qty:               1000,
    unitOfIssue:       'EA',
  },
]

// ── Helpers ──────────────────────────────────────────────────

const DIBBS_SET_ASIDE_MAP: Record<string, string[]> = {
  '8A':  ['8(a)'], HUB:    ['HUBZone'],
  WOSB:  ['WOSB'], EDWOSB: ['WOSB'],
  SDVO:  ['SDVOSB'], VO:   ['VOSB'],
  SDB:   ['SDB'],   SB:    [],
}

const OFFICE_LOCATIONS: Record<string, { city: string; state: string }> = {
  'DLA AVIATION':          { city: 'Richmond',        state: 'VA' },
  'DLA LAND AND MARITIME': { city: 'Columbus',         state: 'OH' },
  'DLA TROOP SUPPORT':     { city: 'Philadelphia',     state: 'PA' },
  'DLA ENERGY':            { city: 'Fort Belvoir',     state: 'VA' },
  'DLA DISTRIBUTION':      { city: 'New Cumberland',   state: 'PA' },
}

function fscFromNsn(nsn: string): string | null {
  const clean = nsn.replace(/[^0-9]/g, '')
  return clean.length >= 4 ? clean.slice(0, 4) : null
}

function parseDate(s: unknown): string | null {
  if (!s || typeof s !== 'string') return null
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const mdy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1]}-${mdy[2]}`
  return null
}

// ── Connector ────────────────────────────────────────────────

const DIBBS_BASE = 'https://www.dibbs.bsm.dla.mil'

export const dibbs: SourceConnector = {
  slug: 'dibbs',
  name: 'DIBBS',
  type: 'federal',

  isConfigured() {
    return true // mock data always available; live requires DIBBS_ENABLED=true
  },

  async fetchRaw(since?: Date): Promise<RawContract[]> {
    if (process.env.DIBBS_ENABLED !== 'true') {
      return MOCK_DIBBS.map((d) => ({
        external_id: d.solicitationNumber,
        raw_data:    d as unknown as Record<string, unknown>,
      }))
    }

    const from = since ?? new Date(Date.now() - 7 * 86_400_000)
    const url  = `${DIBBS_BASE}/API/Rfp/GetRfpsByDate?fromDate=${from.toISOString().split('T')[0]}&format=json`

    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
    if (!res.ok) throw new Error(`DIBBS API ${res.status}: ${(await res.text()).slice(0, 300)}`)

    const json = (await res.json()) as { solicitations?: Record<string, unknown>[] }
    return (json.solicitations ?? [])
      .map((item) => ({
        external_id: String(item.solicitationNumber ?? item.rfpNumber ?? '').trim(),
        raw_data:    item,
      }))
      .filter((r) => r.external_id)
  },

  normalize(raw: RawContract): NormalizedContract | null {
    const d = raw.raw_data as Record<string, unknown>

    const title = String(d.itemDescription ?? d.description ?? '').trim()
    if (!title) return null

    const dueDate = parseDate(d.closingDate) ?? parseDate(d.responseDate) ?? null
    if (!dueDate) return null

    const nsn        = String(d.nsn ?? d.nationalStockNumber ?? '').trim()
    const fscField   = String(d.fscCode ?? d.fsc ?? '').trim()
    const fscDerived = nsn ? fscFromNsn(nsn) : null
    const fscCode    = fscField || fscDerived
    const fsc_codes  = fscCode ? [fscCode] : []

    const officeName = String(d.purchasingOffice ?? '').trim()
    const loc = OFFICE_LOCATIONS[officeName.toUpperCase()] ?? { city: 'Richmond', state: 'VA' }

    const setAside = String(d.setAside ?? '').trim().toUpperCase()
    const solNum   = String(d.solicitationNumber ?? d.rfpNumber ?? '').trim()

    return {
      title,
      agency:                  'Defense Logistics Agency',
      location:                `${loc.city}, ${loc.state}`,
      state:                   loc.state,
      due_date:                dueDate,
      description:             title,
      requirements:            [],
      naics_codes:             [],
      fsc_codes,
      nsn:                     nsn || undefined,
      solicitation_type:       String(d.procurementType ?? '').trim() || undefined,
      set_aside:               setAside || undefined,
      certifications_required: DIBBS_SET_ASIDE_MAP[setAside] ?? [],
      solicitation_number:     solNum || undefined,
      posted_date:             parseDate(d.issueDate ?? d.postedDate) ?? undefined,
      source_slug:             'dibbs',
      source_name:             'DIBBS',
      source_url:              solNum
        ? `${DIBBS_BASE}/Rfp/RfpSol.aspx?sn=${encodeURIComponent(solNum)}`
        : DIBBS_BASE,
      external_id:             raw.external_id,
      raw_data:                raw.raw_data,
    }
  },
}
