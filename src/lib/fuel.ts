import type { FuelStation } from '../../shared/types'

const DAY_CODES = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA']
export const DAY_LABELS: Record<string, string> = {
  MO: 'Montag',
  DI: 'Dienstag',
  MI: 'Mittwoch',
  DO: 'Donnerstag',
  FR: 'Freitag',
  SA: 'Samstag',
  SO: 'Sonntag',
  FE: 'Feiertag',
}

/** Geöffnet laut hinterlegten Öffnungszeiten (Wiener Zeit). `null` = unbekannt. */
export function openNow(station: FuelStation, now = new Date()): boolean | null {
  if (!station.hours) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Vienna',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? ''
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const spec = station.hours[DAY_CODES[idx]]
  if (!spec) return false
  if (spec === '24h') return true
  const [from, to] = spec.split('-').map((s) => {
    const [hh, mm] = s.split(':').map(Number)
    return hh * 60 + mm
  })
  const cur = h * 60 + m
  return to > from ? cur >= from && cur < to : cur >= from || cur < to
}

/** Luftlinie in km */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(x))
}

/** Übliche Abweichung je Tagesstunde vom Tagesmittel (ct), aus stündlichen Durchschnitten. */
export function hourlyPattern(stats: [number, number][], hourOf: (tsMs: number) => number, dayOf: (tsMs: number) => string) {
  const byDay = new Map<string, [number, number][]>()
  for (const [t, v] of stats) {
    const d = dayOf(t)
    const list = byDay.get(d) ?? []
    list.push([t, v])
    byDay.set(d, list)
  }
  const sums = Array.from({ length: 24 }, () => ({ sum: 0, n: 0 }))
  let days = 0
  for (const list of byDay.values()) {
    if (list.length < 18) continue // nur (fast) vollständige Tage
    days++
    const mean = list.reduce((a, b) => a + b[1], 0) / list.length
    for (const [t, v] of list) {
      const h = hourOf(t)
      sums[h].sum += (v - mean) * 100
      sums[h].n++
    }
  }
  return { days, deviations: sums.map((s) => (s.n ? s.sum / s.n : null)) }
}
