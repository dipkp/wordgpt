/**
 * Deterministic PII detection and redaction.
 *
 * No model is involved: findings are produced with regular expressions so the
 * same text always yields the same placeholders, offline and instantly. Names
 * and free-text addresses are intentionally out of scope — review afterwards.
 */

export type PiiType = 'EMAIL' | 'IBAN' | 'ID' | 'CARD' | 'PHONE'

export interface PiiFinding {
  type: PiiType
  value: string
  start: number
  end: number
}

export interface TaggedFinding extends PiiFinding {
  tag: string
}

interface PiiPattern {
  type: PiiType
  priority: number
  pattern: RegExp
}

/** Lower priority number = more specific = wins when two matches overlap. */
const PATTERNS: PiiPattern[] = [
  { type: 'EMAIL', priority: 0, pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { type: 'IBAN', priority: 0, pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
  { type: 'ID', priority: 1, pattern: /\b\d{17}[\dXx]\b/g },
  { type: 'CARD', priority: 2, pattern: /\b\d(?:[ -]?\d){12,18}\b/g },
  {
    type: 'PHONE',
    priority: 3,
    pattern: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{2,4})?/g,
  },
]

type ScoredFinding = PiiFinding & { priority: number }

export function scanPII(text: string): PiiFinding[] {
  const hits: ScoredFinding[] = []

  for (const { type, priority, pattern } of PATTERNS) {
    pattern.lastIndex = 0
    let match = pattern.exec(text)
    while (match !== null) {
      const value = match[0]
      const digits = (value.match(/\d/g) ?? []).length
      // 2024-2025 / 2024/25 are dates, not phone numbers
      const looksLikeYearRange = /^\s*\d{4}\s*[-–—/]\s*\d{2,4}\s*$/.test(value)

      const usable =
        value.trim().length > 0 &&
        !(type === 'PHONE' && (looksLikeYearRange || digits < 8 || digits > 15)) &&
        !(type === 'CARD' && digits < 13)

      if (usable) {
        hits.push({ type, priority, value, start: match.index, end: match.index + value.length })
      }
      match = pattern.exec(text)
    }
  }

  hits.sort((a, b) => a.priority - b.priority || b.value.length - a.value.length || a.start - b.start)

  const kept: ScoredFinding[] = []
  for (const hit of hits) {
    const overlaps = kept.some(other => hit.start < other.end && hit.end > other.start)
    if (!overlaps) kept.push(hit)
  }

  return kept
    .sort((a, b) => a.start - b.start)
    .map(({ type, value, start, end }) => ({ type, value, start, end }))
}

/** Assigns one stable placeholder per distinct value: `[EMAIL-1]`, `[PHONE-2]`, … */
export function tagFindings(findings: PiiFinding[]): TaggedFinding[] {
  const counters: Partial<Record<PiiType, number>> = {}
  const seen = new Set<string>()
  const tagged: TaggedFinding[] = []

  for (const finding of findings) {
    if (seen.has(finding.value)) continue
    seen.add(finding.value)
    counters[finding.type] = (counters[finding.type] ?? 0) + 1
    tagged.push({ ...finding, tag: `[${finding.type}-${counters[finding.type]}]` })
  }

  return tagged
}

/** In-memory redaction, used in tests and in the standalone pane. */
export function redactText(text: string): { text: string; count: number } {
  const tagged = tagFindings(scanPII(text))
  let output = text
  for (const finding of tagged) {
    output = output.split(finding.value).join(finding.tag)
  }
  return { text: output, count: tagged.length }
}
