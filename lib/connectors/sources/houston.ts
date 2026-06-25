import { ProcurementConnector } from '../connector'
import type { FetchOptions, SourceType } from '../connector'
import type { NormalizedOpportunity } from '../normalizer'

// City of Houston Purchasing Department (IonWave eProcurement)
// Portal: https://purchasing.houstontx.gov
// No public API. Set HOUSTON_API_KEY once IonWave vendor access is obtained.

interface HoustonRecord {
  solicitation_number:  string
  title:                string
  department:           string
  open_date:            string
  close_date:           string
  description:          string
  commodity_code:       string
  estimated_value_min?: number
  estimated_value_max?: number
}

const MOCK_HOUSTON: HoustonRecord[] = [
  {
    solicitation_number: 'COH-PARKS-2026-117',
    title: 'Parks and Recreation Landscaping Services',
    department: 'City of Houston Parks & Recreation',
    open_date: '2026-06-18', close_date: '2026-08-05', commodity_code: '561730',
    description: 'Mowing, planting, irrigation maintenance, and grounds keeping across 300+ city parks. Multi-year with annual renewals.',
    estimated_value_min: 200000, estimated_value_max: 800000,
  },
  {
    solicitation_number: 'COH-IT-2026-044',
    title: 'IT Equipment and Peripherals — Annual Blanket Purchase',
    department: 'City of Houston Information Technology',
    open_date: '2026-06-20', close_date: '2026-07-25', commodity_code: '334111',
    description: 'Annual blanket purchase for desktops, laptops, monitors, and peripherals for all City departments. TAA-compliant equipment preferred.',
    estimated_value_min: 500000, estimated_value_max: 1500000,
  },
  {
    solicitation_number: 'COH-FLEET-2026-089',
    title: 'Emergency Vehicle Upfitting Services',
    department: 'City of Houston Fleet Management',
    open_date: '2026-06-24', close_date: '2026-08-20', commodity_code: '811198',
    description: 'Upfitting of police, fire, and EMS vehicles with emergency lighting, communications, and specialty equipment.',
    estimated_value_min: 300000, estimated_value_max: 1200000,
  },
]

class HoustonConnector extends ProcurementConnector {
  readonly slug = 'houston'
  readonly name = 'City of Houston'
  readonly type: SourceType = 'city'

  protected async fetch(options?: FetchOptions): Promise<HoustonRecord[]> {
    if (!process.env.HOUSTON_API_KEY) {
      const cutoff = options?.since ?? new Date(Date.now() - 7 * 86_400_000)
      return MOCK_HOUSTON.filter((r) => new Date(r.open_date) >= cutoff)
    }

    const apiKey = process.env.HOUSTON_API_KEY
    const since  = options?.since
    const qs = new URLSearchParams({
      token: apiKey,
      ...(since && { from_date: since.toISOString().split('T')[0] }),
    })
    const res = await fetch(`https://api.ionwave.net/houston/bids?${qs}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Houston API ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return (await res.json()) as HoustonRecord[]
  }

  protected parse(raw: unknown): HoustonRecord | null {
    const d = raw as HoustonRecord
    if (!d.title?.trim() || !d.solicitation_number?.trim()) return null
    return d
  }

  protected normalize(parsed: unknown): NormalizedOpportunity | null {
    const d = parsed as HoustonRecord

    const title = (d.title ?? '').trim()
    if (!title || !d.close_date) return null

    return {
      external_id:             `hou-${d.solicitation_number}`,
      source_slug:             'houston',
      source_name:             'City of Houston',
      source_url:              'https://purchasing.houstontx.gov',
      title,
      agency:                  d.department ?? 'City of Houston',
      location:                'Houston, TX',
      state:                   'TX',
      due_date:                d.close_date,
      posted_date:             d.open_date || undefined,
      value_min:               d.estimated_value_min,
      value_max:               d.estimated_value_max,
      description:             d.description ?? title,
      requirements:            [],
      naics_codes:             d.commodity_code ? [d.commodity_code] : [],
      certifications_required: [],
      solicitation_number:     d.solicitation_number,
      raw_data:                d as unknown as Record<string, unknown>,
    }
  }
}

export const houston = new HoustonConnector()
