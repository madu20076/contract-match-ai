import type { SourceConnector, RawContract, NormalizedContract } from './types'

// City of Houston Purchasing Department
// Portal: https://purchasing.houstontx.gov (IonWave eProcurement)
// No public API. Set HOUSTON_API_KEY once IonWave vendor access is obtained.
// Without a key, returns mock solicitations.

// ── Mock data ────────────────────────────────────────────────

interface HoustonRecord {
  solicitation_number: string
  title: string
  department: string
  open_date: string
  close_date: string
  description: string
  commodity_code: string
  estimated_value_min?: number
  estimated_value_max?: number
}

const MOCK_HOUSTON: HoustonRecord[] = [
  {
    solicitation_number: 'COH-PARKS-2026-117',
    title:               'Parks and Recreation Landscaping Services',
    department:          'City of Houston Parks & Recreation',
    open_date:           '2026-06-18',
    close_date:          '2026-08-05',
    commodity_code:      '561730',
    description:         'Mowing, planting, irrigation maintenance, and grounds keeping across 300+ city parks. Multi-year with annual renewals.',
    estimated_value_min:  200000,
    estimated_value_max:  800000,
  },
  {
    solicitation_number: 'COH-IT-2026-044',
    title:               'IT Equipment and Peripherals — Annual Blanket Purchase',
    department:          'City of Houston Information Technology',
    open_date:           '2026-06-20',
    close_date:          '2026-07-25',
    commodity_code:      '334111',
    description:         'Annual blanket purchase for desktops, laptops, monitors, and peripherals for all City departments. TAA-compliant equipment preferred.',
    estimated_value_min:  500000,
    estimated_value_max:  1500000,
  },
  {
    solicitation_number: 'COH-FLEET-2026-089',
    title:               'Emergency Vehicle Upfitting Services',
    department:          'City of Houston Fleet Management',
    open_date:           '2026-06-24',
    close_date:          '2026-08-20',
    commodity_code:      '811198',
    description:         'Upfitting of police, fire, and EMS vehicles with emergency lighting, communications, and specialty equipment.',
    estimated_value_min:  300000,
    estimated_value_max:  1200000,
  },
]

// ── Connector ────────────────────────────────────────────────

export const houston: SourceConnector = {
  slug: 'houston',
  name: 'City of Houston',
  type: 'city',

  isConfigured() {
    return true // mock data always available; live requires HOUSTON_API_KEY
  },

  async fetchRaw(since?: Date): Promise<RawContract[]> {
    if (!process.env.HOUSTON_API_KEY) {
      const cutoff = since ?? new Date(Date.now() - 7 * 86_400_000)
      return MOCK_HOUSTON
        .filter((r) => new Date(r.open_date) >= cutoff)
        .map((r) => ({
          external_id: `hou-${r.solicitation_number}`,
          raw_data:    r as unknown as Record<string, unknown>,
        }))
    }

    const apiKey = process.env.HOUSTON_API_KEY
    const qs = new URLSearchParams({
      token: apiKey,
      ...(since && { from_date: since.toISOString().split('T')[0] }),
    })
    const res = await fetch(`https://api.ionwave.net/houston/bids?${qs}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Houston API ${res.status}: ${(await res.text()).slice(0, 300)}`)

    const items = (await res.json()) as HoustonRecord[]
    return items.map((item) => ({
      external_id: `hou-${item.solicitation_number}`,
      raw_data:    item as unknown as Record<string, unknown>,
    }))
  },

  normalize(raw: RawContract): NormalizedContract | null {
    const d = raw.raw_data as unknown as HoustonRecord

    const title = (d.title ?? '').trim()
    if (!title || !d.close_date) return null

    return {
      title,
      agency:                  d.department ?? 'City of Houston',
      location:                'Houston, TX',
      state:                   'TX',
      due_date:                d.close_date,
      value_min:               d.estimated_value_min,
      value_max:               d.estimated_value_max,
      description:             d.description ?? title,
      requirements:            [],
      naics_codes:             d.commodity_code ? [d.commodity_code] : [],
      certifications_required: [],
      solicitation_number:     d.solicitation_number,
      posted_date:             d.open_date || undefined,
      source_slug:             'houston',
      source_name:             'City of Houston',
      source_url:              'https://purchasing.houstontx.gov',
      external_id:             raw.external_id,
      raw_data:                raw.raw_data,
    }
  },
}
