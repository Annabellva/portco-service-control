/**
 * Normalizes an email subject for case-matching.
 * Strips reply/forward prefixes, case numbers, trailing whitespace,
 * and lowercases for comparison.
 */
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|aw|fwd|fw|wg):\s*/gi, '') // strip Re:/Fwd:/AW:/WG:
    .replace(/\[.*?\]/g, '')                   // strip [TICKET-123] etc.
    .replace(/\(.*?\)/g, '')                   // strip (case: 123) etc.
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
