/** 날짜 계산. 날짜 문자열은 사용자 기준 시간대의 YYYY-MM-DD 다 */

export function dayKey(ms: number): string {
  return new Date(ms).toLocaleDateString('sv-SE')
}

/** 시간대·일광절약과 상관없이 날짜만 더하고 뺀다 */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

/** 0 = 일요일 */
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** "2026-10" */
export function monthKey(date: string): string {
  return date.slice(0, 7)
}

export function isDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return addDays(s, 0) === s
}
