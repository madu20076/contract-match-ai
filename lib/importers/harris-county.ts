import type { SourceConnector, RawContract, NormalizedContract } from './types'

// Harris County Purchasing Department (Bonfire eProcurement)
// Portal: https://harriscounty.bonfirehub.com
// No public API. Set HARRIS_COUNTY_API_KEY once Bonfire enterprise access is obtained.
// Without a key, returns mock solicitations.

// ── Mock data ────────────────────────────────────────────────

interface BonfireRecord {
  id: string
  title: string
  department: string
  published_date: string
  close_date: string
  description: string
  commodity_codes: string[]
  estimated_value_min?: number
  estimated_value_max?: number
}

const MOCK_HARRIS_COUNTY: BonfireRecord[] = [
  {
    id:              'HC-2026-0092',
    title:           'Fleet Vehicle Maintenance Services',
    department:      'Harris County Fleet Services',
    published_date:  '2026-06-14',
    close_date:      '2026-07-28',
    commodity_codes: ['811111', '811112'],
    description:     'Preventive maintenance, repair, and inspection of county fleet vehicles — patrol cars, heavy equipment, and light-duty trucks.',
    estimated_value_min: 500000,
    estimated_value_max: 2000000,
  },
  {
    id:              'HC-2026-0107',
    title:           'Janitorial and Custodial Services — County Buildings',
    department:      'Harris County Facilities & Property Management',
    published_date:  '2026-06-20',
    close_date:      '2026-08-08',
    commodity_codes: ['561720'],
    description:     'Janitorial and custodial services for Harris County administrative buildings, courthouses, and community centers across the county.',
    estimated_value_min: 300000,
    estimated_value_max: 900000,
  },
  {
    id:              'HC-2026-0054',
    title:           'Cybersecurity Assessment and Penetration Testing',
    department:      'Harris County Information Technology',
    published_date:  '2026-06-10',
    close_date:      '2026-07-15',
    commodity_codes: ['541512', '541519'],
    description:     'External and internal penetration testing, vulnerability assessments, and security posture review for Harris County IT infrastructure.',
    estimated_value_min: 100000,
    estimated_value_max: 350000,
  },
]

// ── Connector ────────────────────────────────────────────────

export const harrisCounty: SourceConnector = {
  slug: 'harris-county',
  name: 'Harris County',
  type: 'county',

  isConfigured() {
    return true // mock data always available; live requires HARRIS_COUNTY_API_KEY
  },

  async fetchRaw(since?: Date): Promise<RawContract[]> {
    if (!process.env.HARRIS_COUNTY_API_KEY) {
      const cutoff = since ?? new Date(Date.now() - 7 * 86_400_000)
      return MOCK_HARRIS_COUNTY
        .filter((r) => new Date(r.published_date) >= cutoff)
        .map((r) => ({
          external_id: `hc-${r.id}`,
          raw_data:    r as unknown as Record<string, unknown>,
        }))
    }

    const apiKey = process.env.HARRIS_COUNTY_API_KEY
    const qs = new URLSearchParams({
      api_key: apiKey,
      ...(since && { published_after: since.toISOString() }),
    })
    const res = await fetch(`https://api.gobonfire.com/v1/opportunities?${qs}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Harris County API ${res.status}: ${(await res.text()).slice(0, 300)}`)

    const items = (await res.json()) as BonfireRecord[]
    return items.map((item) => ({
      external_id: `hc-${item.id}`,
      raw_data:    item as unknown as Record<string, unknown>,
    }))
  },

  normalize(raw: RawContract): NormalizedContract | null {
    const d = raw.raw_data as unknown as BonfireRecord

    const title = (d.title ?? '').trim()
    if (!title || !d.close_date) return null

    return {
      title,
      agency:                  d.department ?? 'Harris County',
      location:                'Houston, TX',
      state:                   'TX',
      due_date:                d.close_date,
      value_min:               d.estimated_value_min,
      value_max:               d.estimated_value_max,
      description:             d.description ?? title,
      requirements:            [],
      naics_codes:             d.commodity_codes ?? [],
      certifications_required: [],
      solicitation_number:     d.id,
      posted_date:             d.published_date || undefined,
      source_slug:             'harris-county',
      source_name:             'Harris County',
      source_url:              'https://harriscounty.bonfirehub.com',
      external_id:             raw.external_id,
      raw_data:                raw.raw_data,
    }
  },
}
