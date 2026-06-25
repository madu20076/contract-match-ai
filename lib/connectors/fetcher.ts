export async function safeFetch(
  url:       string,
  init?:     RequestInit,
  timeoutMs = 30_000,
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    cache:  'no-store',
  })
}

export function buildQs(params: Record<string, string | number | undefined>): URLSearchParams {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v))
  }
  return qs
}
