function getTimeZoneParts(
  value: Date | string | number,
  timeZone: string,
): { year: string; month: string; day: string } | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) return null
  return { year, month, day }
}

export function formatDateKeyInTimeZone(
  value: Date | string | number,
  timeZone: string,
): string | null {
  const parts = getTimeZoneParts(value, timeZone)
  if (!parts) return null
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function getTodayDateKeyInTimeZone(timeZone: string, now = new Date()): string {
  return formatDateKeyInTimeZone(now, timeZone) || now.toISOString().slice(0, 10)
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + deltaDays)
  return date.toISOString().slice(0, 10)
}

export function getRecentDateKeysInTimeZone(
  days: number,
  timeZone: string,
  now = new Date(),
): string[] {
  const count = Math.max(Math.trunc(days) || 1, 1)
  const todayKey = getTodayDateKeyInTimeZone(timeZone, now)
  const keys: string[] = []

  for (let index = count - 1; index >= 0; index -= 1) {
    keys.push(shiftDateKey(todayKey, -index))
  }

  return keys
}
