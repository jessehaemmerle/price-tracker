import { getJson, setHostDelay } from '../lib/http'
import {
  FUEL_TYPES,
  type FuelHistoryFile,
  type FuelLatestFile,
  type FuelStation,
  type FuelStationsFile,
  type FuelType,
} from '../../shared/types'
import type { Logger } from './types'

/**
 * Spritpreise aus dem offiziellen Spritpreisrechner der E-Control.
 *
 * Die API liefert pro Abfrage die zehn nächsten Tankstellen, Preise aber nur
 * für die günstigere Hälfte (gesetzliche Vorgabe). Darum: Register aller
 * Tankstellen über ein Raster aufbauen und stündlich an jedem
 * Postleitzahl-Schwerpunkt abfragen.
 */

const HOST = 'api.e-control.at'
const API = `https://${HOST}/sprit/1.0`
const VORARLBERG_CODE = 8
const REGISTRY_MAX_AGE_DAYS = 7

interface ApiStation {
  id: number
  name: string
  location: { address: string; postalCode: string; city: string; latitude: number; longitude: number }
  openingHours?: { day: string; from: string; to: string }[]
  open?: boolean
  prices?: { fuelType: FuelType; amount: number }[]
}

interface ApiRegion {
  code: number
  type: string
  name: string
  postalCodes?: string[]
  subRegions?: ApiRegion[]
}

export interface FuelRunResult {
  stations: FuelStationsFile
  latest: FuelLatestFile
  history: FuelHistoryFile
  pricedCount: Record<FuelType, number>
}

const fetchJson = <T>(path: string) => getJson<T>(`${API}${path}`, { skipRobots: true, timeoutMs: 30_000 })

/** Postleitzahl → Bezirk für Vorarlberg, dazu die Bezirkscodes. */
async function loadDistricts(): Promise<{ byPostalCode: Map<string, string>; codes: number[] }> {
  const regions = await fetchJson<ApiRegion[]>('/regions?includeCities=false')
  const vbg = regions.find((r) => r.code === VORARLBERG_CODE)
  if (!vbg?.subRegions?.length) throw new Error('E-Control: Region Vorarlberg nicht gefunden')
  const byPostalCode = new Map<string, string>()
  for (const district of vbg.subRegions) for (const plz of district.postalCodes ?? []) byPostalCode.set(plz, district.name)
  return { byPostalCode, codes: vbg.subRegions.map((r) => r.code) }
}

function compactHours(hours: ApiStation['openingHours']): FuelStation['hours'] {
  if (!hours?.length) return undefined
  const out: Record<string, string> = {}
  for (const h of hours) out[h.day] = h.from === '00:00' && h.to === '24:00' ? '24h' : `${h.from}-${h.to}`
  return out
}

function toStation(s: ApiStation, district: string): FuelStation {
  return {
    id: s.id,
    name: (s.name ?? '').trim() || 'Tankstelle',
    address: (s.location.address ?? '').trim(),
    postalCode: s.location.postalCode,
    city: (s.location.city ?? '').trim(),
    district,
    lat: Math.round(s.location.latitude * 1e6) / 1e6,
    lon: Math.round(s.location.longitude * 1e6) / 1e6,
    hours: compactHours(s.openingHours),
  }
}

async function byAddress(lat: number, lon: number, fuel: FuelType): Promise<ApiStation[]> {
  return fetchJson<ApiStation[]>(
    `/search/gas-stations/by-address?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}&fuelType=${fuel}&includeClosed=true`,
  )
}

async function byRegion(code: number, type: 'BL' | 'PB', fuel: FuelType): Promise<ApiStation[]> {
  return fetchJson<ApiStation[]>(`/search/gas-stations/by-region?code=${code}&type=${type}&fuelType=${fuel}&includeClosed=true`)
}

/** Register über ein Raster (ca. 5 km) über Vorarlberg aufbauen. */
async function buildRegistry(districts: Map<string, string>, log: Logger): Promise<Map<number, FuelStation>> {
  const found = new Map<number, FuelStation>()
  let points = 0
  for (let lat = 46.84; lat <= 47.6; lat += 0.045) {
    for (let lon = 9.53; lon <= 10.25; lon += 0.06) {
      points++
      for (const s of await byAddress(lat, lon, 'DIE')) {
        const district = districts.get(s.location.postalCode)
        if (district && !found.has(s.id)) found.set(s.id, toStation(s, district))
      }
    }
  }
  log(`fuel: Register neu aufgebaut – ${found.size} Tankstellen aus ${points} Rasterpunkten`)
  return found
}

/** Ein Abfragepunkt pro Postleitzahl (Schwerpunkt der Tankstellen dort). */
export function queryPoints(stations: FuelStation[]): { lat: number; lon: number }[] {
  const groups = new Map<string, { lat: number; lon: number; n: number }>()
  for (const s of stations) {
    const g = groups.get(s.postalCode) ?? { lat: 0, lon: 0, n: 0 }
    g.lat += s.lat
    g.lon += s.lon
    g.n++
    groups.set(s.postalCode, g)
  }
  return [...groups.values()].map((g) => ({ lat: g.lat / g.n, lon: g.lon / g.n }))
}

export async function runFuel(
  previous: { stations: FuelStationsFile | null; latest: FuelLatestFile | null; history: FuelHistoryFile | null },
  log: Logger,
  now = new Date(),
): Promise<FuelRunResult> {
  setHostDelay(HOST, 300)
  const { byPostalCode: districts, codes: districtCodes } = await loadDistricts()

  const registryAge = previous.stations?.stations.length
    ? (now.getTime() - new Date(previous.stations.updatedAt).getTime()) / 86_400_000
    : Infinity
  const rebuild = registryAge > REGISTRY_MAX_AGE_DAYS
  const registry = rebuild
    ? await buildRegistry(districts, log)
    : new Map((previous.stations?.stations ?? []).map((s) => [s.id, s]))

  const prices: FuelLatestFile['prices'] = {}
  const open: FuelLatestFile['open'] = {}

  const record = (list: ApiStation[], fuel: FuelType) => {
    for (const s of list) {
      const district = districts.get(s.location.postalCode)
      if (!district) continue // nicht in Vorarlberg
      if (!registry.has(s.id)) registry.set(s.id, toStation(s, district))
      const key = String(s.id)
      const entry = (prices[key] ??= {})
      const amount = s.prices?.find((p) => p.fuelType === fuel)?.amount
      if (typeof amount === 'number' && amount > 0.5 && amount < 5) entry[fuel] = amount
      else if (entry[fuel] === undefined) entry[fuel] = null
      if (typeof s.open === 'boolean') open[key] = s.open
    }
  }

  const points = queryPoints([...registry.values()])
  for (const fuel of ['DIE', 'SUP'] as const) {
    for (const p of points) record(await byAddress(p.lat, p.lon, fuel), fuel)
  }
  // Bezirks- und Landesabfragen ergänzen die günstigsten je Bezirk; CNG gibt es nur an wenigen Stationen.
  for (const fuel of FUEL_TYPES) {
    record(await byRegion(VORARLBERG_CODE, 'BL', fuel), fuel)
    for (const code of districtCodes) record(await byRegion(code, 'PB', fuel), fuel)
  }

  const pricedCount = Object.fromEntries(
    FUEL_TYPES.map((f) => [f, Object.values(prices).filter((e) => typeof e[f] === 'number').length]),
  ) as Record<FuelType, number>
  log(`fuel: ${registry.size} Tankstellen, mit Preis – Diesel ${pricedCount.DIE}, Super ${pricedCount.SUP}, CNG ${pricedCount.GAS}`)
  if (pricedCount.DIE < 10 || pricedCount.SUP < 10) {
    throw new Error('E-Control lieferte zu wenige Preise – Lauf verworfen')
  }

  const nowIso = now.toISOString()
  const ts = Math.floor(now.getTime() / 1000)
  const history: FuelHistoryFile = previous.history ?? { updatedAt: nowIso, stations: {}, stats: {} }
  history.updatedAt = nowIso
  for (const [id, entry] of Object.entries(prices)) {
    for (const fuel of FUEL_TYPES) {
      const v = entry[fuel]
      if (typeof v !== 'number') continue
      const series = ((history.stations[id] ??= {})[fuel] ??= [])
      if (series[series.length - 1]?.[1] !== v) series.push([ts, v])
    }
  }
  for (const fuel of FUEL_TYPES) {
    const values = Object.values(prices)
      .map((e) => e[fuel])
      .filter((v): v is number => typeof v === 'number')
    if (!values.length) continue
    const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000
    ;(history.stats[fuel] ??= []).push([ts, avg, Math.min(...values), values.length])
  }
  pruneFuelHistory(history, ts)

  return {
    stations: {
      updatedAt: rebuild ? nowIso : (previous.stations?.updatedAt ?? nowIso),
      stations: [...registry.values()].sort((a, b) => a.city.localeCompare(b.city, 'de') || a.name.localeCompare(b.name, 'de')),
    },
    latest: { updatedAt: nowIso, prices, open },
    history,
    pricedCount,
  }
}

/** Stündliche Statistik 400 Tage, Stationsverläufe zwei Jahre aufheben. */
export function pruneFuelHistory(h: FuelHistoryFile, nowTs: number): void {
  const statCutoff = nowTs - 400 * 86_400
  const stationCutoff = nowTs - 730 * 86_400
  for (const f of FUEL_TYPES) {
    const s = h.stats[f]
    if (s) h.stats[f] = s.filter((p) => p[0] >= statCutoff)
  }
  for (const entry of Object.values(h.stations)) {
    for (const f of FUEL_TYPES) {
      const s = entry[f]
      if (!s) continue
      const first = s.findIndex((p) => p[0] >= stationCutoff)
      if (first === -1) entry[f] = s.slice(-1)
      else if (first > 1) entry[f] = s.slice(first - 1)
    }
  }
}
