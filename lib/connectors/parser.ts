export function parseIsoDate(s: unknown): string | null {
  if (!s || typeof s !== 'string') return null
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

export function parseMdy(s: unknown): string | null {
  if (!s || typeof s !== 'string') return null
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null
}

export function parseDate(s: unknown): string | null {
  return parseIsoDate(s) ?? parseMdy(s)
}

export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

// SAM.gov requires mm/dd/yyyy
export function toMmDdYyyy(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  const mm  = String(dt.getMonth() + 1).padStart(2, '0')
  const dd  = String(dt.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${dt.getFullYear()}`
}
