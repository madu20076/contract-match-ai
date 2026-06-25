import type { NormalizedOpportunity } from './normalizer'
import type { BusinessProfile } from '@/types'

export interface MatchScore {
  score:   number  // 0–100
  reasons: string[]
}

export function scoreOpportunity(
  opp:     NormalizedOpportunity,
  profile: BusinessProfile,
): MatchScore {
  let score = 0
  const reasons: string[] = []

  // NAICS match — 40 pts
  const naicsOverlap = opp.naics_codes.filter((n) =>
    profile.naics_codes.some((p) =>
      n.startsWith(p.slice(0, 4)) || p.startsWith(n.slice(0, 4))
    )
  )
  if (naicsOverlap.length > 0) {
    score += 40
    reasons.push(`NAICS match: ${naicsOverlap.join(', ')}`)
  }

  // Certifications — 30 pts if required certs overlap, 15 pts if unrestricted
  const certOverlap = opp.certifications_required.filter((c) =>
    profile.certifications.includes(c)
  )
  if (certOverlap.length > 0) {
    score += 30
    reasons.push(`Certifications: ${certOverlap.join(', ')}`)
  } else if (opp.certifications_required.length === 0) {
    score += 15
    reasons.push('No certification restriction')
  }

  // State match — 10 pts
  if (opp.state && profile.state && opp.state === profile.state) {
    score += 10
    reasons.push(`Local: ${opp.state}`)
  }

  // FSC match — 10 pts
  if (opp.fsc_codes && profile.fsc_codes.length > 0) {
    const fscOverlap = opp.fsc_codes.filter((f) => profile.fsc_codes.includes(f))
    if (fscOverlap.length > 0) {
      score += 10
      reasons.push(`FSC match: ${fscOverlap.join(', ')}`)
    }
  }

  // Keyword match — 10 pts
  const haystack = `${opp.title} ${opp.description}`.toLowerCase()
  const kwMatch   = profile.keywords.some((k) => haystack.includes(k.toLowerCase()))
  if (kwMatch) {
    score += 10
    reasons.push('Keyword match')
  }

  return { score: Math.min(100, score), reasons }
}
