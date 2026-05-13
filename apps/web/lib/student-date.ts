export function formatStudentDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function formatLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getLocalDateRangeEndingToday(days: number, date: Date = new Date()): {
  periodStart: string
  periodEnd: string
} {
  const endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - Math.max(1, days) + 1)
  return {
    periodStart: formatLocalDateKey(startDate),
    periodEnd: formatLocalDateKey(endDate),
  }
}
