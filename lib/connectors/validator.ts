import type { NormalizedOpportunity } from './normalizer'

export interface ValidationResult {
  valid:    boolean
  errors:   string[]
  warnings: string[]
}

export function validateOpportunity(opp: NormalizedOpportunity): ValidationResult {
  const errors:   string[] = []
  const warnings: string[] = []

  if (!opp.title?.trim())       errors.push('title is required')
  if (!opp.external_id?.trim()) errors.push('external_id is required')
  if (!opp.source_slug?.trim()) errors.push('source_slug is required')
  if (!opp.agency?.trim())      errors.push('agency is required')
  if (!opp.due_date)            errors.push('due_date is required')
  if (!opp.state?.trim())       errors.push('state is required')
  if (!opp.description?.trim()) warnings.push('description is empty')

  if (opp.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(opp.due_date)) {
    errors.push(`due_date "${opp.due_date}" is not yyyy-mm-dd`)
  }

  return { valid: errors.length === 0, errors, warnings }
}
