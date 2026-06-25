import { validateOpportunity } from './validator'
import type { NormalizedOpportunity, ImportFilters } from './normalizer'
import type { ValidationResult } from './validator'

export type { ImportFilters }
export type SourceType = 'federal' | 'state' | 'city' | 'county'

export interface FetchOptions {
  since?:   Date
  filters?: ImportFilters
}

export interface ConnectorResult {
  source_slug:        string
  source_name:        string
  contracts_found:    number
  contracts_valid:    number
  contracts_invalid:  number
  opportunities:      NormalizedOpportunity[]
  errors:             string[]
  duration_ms:        number
}

export interface PipelineResult {
  source_slug:        string
  source_name:        string
  contracts_found:    number
  contracts_inserted: number
  contracts_updated:  number
  skipped:            number
  errors:             string[]
  duration_ms:        number
  run_id?:            string
  filters_applied?:   boolean
}

export abstract class ProcurementConnector {
  abstract readonly slug: string
  abstract readonly name: string
  abstract readonly type: SourceType

  isConfigured(): boolean { return true }

  protected abstract fetch(options?: FetchOptions): Promise<unknown[]>
  protected abstract parse(raw: unknown): unknown
  protected abstract normalize(parsed: unknown): NormalizedOpportunity | null

  validate(opp: NormalizedOpportunity): ValidationResult {
    return validateOpportunity(opp)
  }

  async run(options?: FetchOptions): Promise<ConnectorResult> {
    const start = Date.now()
    const opportunities: NormalizedOpportunity[] = []
    const errors: string[] = []
    let fetched = 0

    let raws: unknown[]
    try {
      raws = await this.fetch(options)
      fetched = raws.length
    } catch (err) {
      errors.push(`fetch failed: ${err instanceof Error ? err.message : String(err)}`)
      return {
        source_slug: this.slug, source_name: this.name,
        contracts_found: 0, contracts_valid: 0, contracts_invalid: 0,
        opportunities: [], errors, duration_ms: Date.now() - start,
      }
    }

    for (const raw of raws) {
      try {
        const parsed = this.parse(raw)
        if (parsed == null) continue
        const normalized = this.normalize(parsed)
        if (!normalized) continue
        const { valid, errors: errs } = this.validate(normalized)
        if (valid) {
          opportunities.push(normalized)
        } else {
          errors.push(`[${normalized.external_id}] ${errs.join('; ')}`)
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }

    return {
      source_slug:       this.slug,
      source_name:       this.name,
      contracts_found:   fetched,
      contracts_valid:   opportunities.length,
      contracts_invalid: fetched - opportunities.length,
      opportunities,
      errors,
      duration_ms:       Date.now() - start,
    }
  }
}
