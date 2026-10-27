const WEEK = ['일', '월', '화', '수', '목', '금', '토']

/** "10월 27일 화요일" */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${m}월 ${d}일 ${WEEK[w]}요일`
}

/** "2026년 10월 27일 화요일" */
export function fullDateLabel(date: string): string {
  return `${date.slice(0, 4)}년 ${dateLabel(date)}`
}
