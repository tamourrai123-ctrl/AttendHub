/**
 * True when an HR reply that came back as HTTP 2xx still clearly says it failed:
 * the body (string or JSON) mentions "fail"/"error" and never mentions "success".
 * Deliberately conservative and the ONE place to change if HR's real reply shape
 * (no sample exists) turns out different; an empty body or an unrelated JSON body
 * is NOT treated as a failure. The body itself is never logged or returned.
 */
export function hrBodyReportsFailure(body: unknown): boolean {
  const text = (typeof body === 'string' ? body : JSON.stringify(body ?? '')).toLowerCase();
  return /fail|error/.test(text) && !text.includes('success');
}
