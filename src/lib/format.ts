const LOCALE = 'de-AT'
const TZ = 'Europe/Vienna'

const EURO_OPTS: Intl.NumberFormatOptions = { style: 'currency', currency: 'EUR' }

/** Cent → "1,99 €" */
export function euro(cents: number): string {
  return (cents / 100).toLocaleString(LOCALE, EURO_OPTS)
}

/** Euro (Zahl) → "1,99 €" */
export function euroValue(value: number): string {
  return value.toLocaleString(LOCALE, EURO_OPTS)
}

export function decimal(value: number, digits = 2): string {
  return value.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** Spritpreis in Hauptteil und dritte Nachkommastelle zerlegen: 1.589 → ["1,58", "9"] */
export function fuelParts(value: number): [string, string] {
  const s = decimal(value, 3)
  return [s.slice(0, -1), s.slice(-1)]
}

const UNIT_LABELS: Record<string, string> = { kg: 'kg', l: 'l', Stk: 'Stk.', m: 'm', 'm²': 'm²', WL: 'WL' }

/** Grundpreis: Cent pro Einheit → "3,50 € / kg" */
export function unitPrice(cents: number, unit: string): string {
  if (!cents || !unit) return ''
  return `${euro(cents)} / ${UNIT_LABELS[unit] ?? unit}`
}

export function percent(value: number, digits = 0): string {
  return `${decimal(value, digits)} %`
}

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })
const rel = relative.format.bind(relative)

/** "vor 12 Minuten", "vor 3 Stunden", "gestern" */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'unbekannt'
  const diff = (new Date(iso).getTime() - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'gerade eben'
  if (abs < 3600) return rel(Math.round(diff / 60), 'minute')
  if (abs < 86_400) return rel(Math.round(diff / 3600), 'hour')
  return rel(Math.round(diff / 86_400), 'day')
}

export function dateTime(input: string | number | Date): string {
  return new Date(input).toLocaleString(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function shortDate(input: string | number | Date): string {
  return new Date(input).toLocaleDateString(LOCALE, { timeZone: TZ, day: 'numeric', month: 'short' })
}

export function longDate(input: string | number | Date): string {
  return new Date(input).toLocaleDateString(LOCALE, { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' })
}

export function hourLabel(input: number | Date): string {
  return new Date(input).toLocaleTimeString(LOCALE, { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

export function weekdayHour(input: number | Date): string {
  return new Date(input).toLocaleString(LOCALE, { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(LOCALE, { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Stunde (0–23) in Wiener Zeit */
export function viennaHour(input: number | Date): number {
  return Number(new Date(input).toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false })) % 24
}

/** Kalendertag (YYYY-MM-DD) in Wiener Zeit */
export function viennaDay(input: number | Date): string {
  return new Date(input).toLocaleDateString('sv-SE', { timeZone: TZ })
}

export function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString(LOCALE)} ${n === 1 ? one : many}`
}
