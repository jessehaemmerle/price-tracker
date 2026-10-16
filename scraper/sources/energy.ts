import { getBytes, getJson, getText, postJson, setHostDelay } from '../lib/http'
import { colToIndex, indexToCol, readFirstSheet } from '../lib/xlsx'
import {
  dayNumber,
  type DailySeriesFile,
  type MonthlySeriesFile,
  type SpotPriceFile,
  type Tariff,
  type TariffFile,
  type TariffSet,
} from '../../shared/types'
import { toNumber } from '../../shared/units'
import type { Logger } from './types'

/* ------------------------- Strom-Börsenpreis ------------------------- */

interface AwattarResponse {
  data: { start_timestamp: number; end_timestamp: number; marketprice: number; unit: string }[]
}

/** Stündliche Day-Ahead-Preise (EPEX Spot, Marktgebiet AT) über die aWATTar-API. */
export async function runSpot(previous: SpotPriceFile | null, log: Logger, now = new Date()): Promise<SpotPriceFile> {
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCDate(start.getUTCDate() - 2)
  const end = new Date(start.getTime() + 5 * 86_400_000)
  const res = await getJson<AwattarResponse>(
    `https://api.awattar.at/v1/marketdata?start=${start.getTime()}&end=${end.getTime()}`,
    { skipRobots: true },
  )
  if (!res.data?.length) throw new Error('aWATTar lieferte keine Daten')
  const map = new Map<number, number>(previous?.hours ?? [])
  for (const h of res.data) {
    if (!/mwh/i.test(h.unit)) continue
    // €/MWh → ct/kWh (÷ 10), auf drei Nachkommastellen
    map.set(Math.floor(h.start_timestamp / 1000), Math.round(h.marketprice * 100) / 1000)
  }
  const cutoff = Math.floor(now.getTime() / 1000) - 90 * 86_400
  const hours = [...map.entries()].filter(([t]) => t >= cutoff).sort((a, b) => a[0] - b[0])
  log(`spot: ${res.data.length} Stunden geladen, ${hours.length} gespeichert`)
  return { updatedAt: now.toISOString(), hours }
}

/* ------------------------------ Heizöl ------------------------------ */

const HEATINGOIL_URL = 'https://www.heizoel24.at/heizoelpreise'

/** Österreich-Durchschnittspreis für 100 Liter Heizöl extra leicht (Heizöl24). */
export function parseHeatingOil(html: string): { day: number; price: number } | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|\s+/g, ' ')
  const m = text.match(/100\s?l\s+(\d{2})\.(\d{2})\.(\d{2,4})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/)
  if (!m) return null
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const date = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])))
  const price = toNumber(m[4])
  if (!(price > 20 && price < 1000)) return null
  return { day: dayNumber(date), price }
}

export async function runHeatingOil(previous: DailySeriesFile | null, log: Logger, now = new Date()): Promise<DailySeriesFile> {
  const parsed = parseHeatingOil(await getText(HEATINGOIL_URL))
  if (!parsed) throw new Error('Heizölpreis nicht gefunden – Seitenstruktur geändert?')
  const map = new Map<number, number>(previous?.series ?? [])
  map.set(parsed.day, parsed.price)
  log(`heizöl: ${parsed.price} €/100 l`)
  return {
    updatedAt: now.toISOString(),
    unit: '€ pro 100 Liter',
    source: 'HeizOel24 Österreich',
    sourceUrl: HEATINGOIL_URL,
    note: 'Österreich-Durchschnitt für Heizöl extra leicht. Für Vorarlberg weist die Quelle keinen eigenen Wert aus.',
    series: [...map.entries()].sort((a, b) => a[0] - b[0]),
  }
}

/* ------------------------------ Pellets ------------------------------ */

const PELLETS_PAGE = 'https://www.propellets.at/aktuelle-pelletpreise'

/** Pelletpreisindex PPI06 (Jänner 2006 = 100) aus der Excel-Tabelle von proPellets Austria. */
export function parsePelletIndex(cells: Map<string, string | number>): [string, number][] {
  const years = new Map<number, number>() // Spaltenindex → Jahr
  let headerRow = 0
  for (const [ref, v] of cells) {
    if (v === 'Jahr') headerRow = Number(ref.replace(/[A-Z]+/, ''))
  }
  if (!headerRow) throw new Error('PPI-Tabelle: Kopfzeile "Jahr" fehlt')
  for (const [ref, v] of cells) {
    const row = Number(ref.replace(/[A-Z]+/, ''))
    if (row === headerRow && typeof v === 'number' && v > 2000 && v < 2100) years.set(colToIndex(ref.replace(/\d+/g, '')), v)
  }
  const months = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  const out: [string, number][] = []
  for (const [ref, v] of cells) {
    if (typeof v !== 'string') continue
    const month = months.indexOf(v.trim())
    if (month < 0) continue
    const row = Number(ref.replace(/[A-Z]+/, ''))
    for (const [col, year] of years) {
      const value = cells.get(`${indexToCol(col)}${row}`)
      if (typeof value === 'number' && value > 0) {
        out.push([`${year}-${String(month + 1).padStart(2, '0')}`, Math.round(value * 100) / 100])
      }
    }
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]))
}

export async function runPellets(log: Logger, now = new Date()): Promise<MonthlySeriesFile> {
  const page = await getText(PELLETS_PAGE)
  const href = page.match(/href="([^"#]*PPI06\.xlsx)/)?.[1]
  if (!href) throw new Error('Link zur PPI-Tabelle nicht gefunden')
  const url = new URL(href, PELLETS_PAGE).toString()
  const series = parsePelletIndex(readFirstSheet(await getBytes(url)))
  if (series.length < 24) throw new Error(`PPI-Tabelle enthält nur ${series.length} Monate`)
  log(`pellets: ${series.length} Monate, zuletzt ${series[series.length - 1].join(' = ')}`)
  return {
    updatedAt: now.toISOString(),
    unit: 'Index (Jänner 2006 = 100)',
    source: 'proPellets Austria, Pelletpreisindex PPI06',
    sourceUrl: PELLETS_PAGE,
    note: 'Lose Pellets ENplus A1 bei 6 t Bestellmenge, Österreich-Durchschnitt, monatlich erhoben.',
    series,
  }
}

/* -------------------------- Strom-/Gastarife -------------------------- */

const RC = 'https://www.e-control.at/o/rc-public-rest'
const ZIP = '6850' // Dornbirn – ganz Vorarlberg gehört zum Netz der Vorarlberger Energienetze
export const POWER_CONSUMPTIONS = [2000, 3500, 5000]
export const GAS_CONSUMPTIONS = [8000, 15000, 25000]
const STANDARD_POWER = 3500
const STANDARD_GAS = 15000

interface GridOperatorResponse {
  gridOperators: { id: number; gridAreaId: number; name: string }[]
  isZipCodeValid: boolean
}

export interface RatedProduct {
  brandName: string
  productName: string
  annualGrossRate: number
  calculatedProductEnergyCosts: { energyRateTotal: number; baseRate: number; totalGrossSum: number; taxRate?: number }
  contractTermInfo?: { priceGuaranteeType?: string; priceGuaranteeMonths?: number | null }
}
interface RateResponse {
  gridOperatorName: string
  ratedProducts: RatedProduct[]
}

export function mapRatedProduct(p: RatedProduct, consumption: number): Tariff | null {
  if (!(p.annualGrossRate > 0)) return null // Spot-Tarife ohne berechenbaren Jahrespreis
  const e = p.calculatedProductEnergyCosts
  const tax = 1 + (e.taxRate ?? 0.2)
  const round2 = (n: number) => Math.round(n * 100) / 100
  return {
    brand: p.brandName.trim(),
    product: p.productName.trim(),
    annualTotal: round2(p.annualGrossRate / 100),
    annualEnergy: round2(e.totalGrossSum / 100),
    energyCt: Math.round(((e.energyRateTotal / consumption) * tax) * 1000) / 1000,
    baseFee: round2((e.baseRate / 100) * tax),
    guaranteeMonths: p.contractTermInfo?.priceGuaranteeMonths ?? null,
    dynamic: p.contractTermInfo?.priceGuaranteeType === 'ADJUSTING',
  }
}

async function rate(energyType: 'POWER' | 'GAS', consumption: number): Promise<TariffSet> {
  const grid = await getJson<GridOperatorResponse>(`${RC}/rate-calculator/grid-operators?zipCode=${ZIP}&energyType=${energyType}`, {
    skipRobots: true,
  })
  const op = grid.gridOperators[0]
  if (!op) throw new Error(`Kein Netzbetreiber für ${ZIP} (${energyType})`)
  const body = {
    customerGroup: 'HOME',
    energyType,
    zipCode: ZIP,
    gridOperatorId: op.id,
    gridAreaId: op.gridAreaId,
    moveHome: true,
    includeSwitchingDiscounts: false,
    ...(energyType === 'POWER'
      ? { firstMeterOptions: { standardConsumption: consumption } }
      : { gasRequestOptions: { annualConsumption: consumption } }),
    comparisonOptions: { manualEntry: false },
    membership: null,
    requirements: [],
  }
  const res = await postJson<RateResponse>(`${RC}/rate-calculator/energy-type/${energyType}/rate?isSmartMeter=false`, body, {
    skipRobots: true,
    timeoutMs: 120_000,
  })
  const tariffs = res.ratedProducts
    .map((p) => mapRatedProduct(p, consumption))
    .filter((t): t is Tariff => t !== null)
    .sort((a, b) => a.annualTotal - b.annualTotal)
  return { consumption, gridOperator: res.gridOperatorName, tariffs }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

export async function runTariffs(previous: TariffFile | null, log: Logger, now = new Date()): Promise<TariffFile> {
  setHostDelay('www.e-control.at', 1500)
  const power: TariffSet[] = []
  const gas: TariffSet[] = []
  for (const c of POWER_CONSUMPTIONS) power.push(await rate('POWER', c))
  for (const c of GAS_CONSUMPTIONS) gas.push(await rate('GAS', c))
  const stdPower = power.find((s) => s.consumption === STANDARD_POWER)!
  const stdGas = gas.find((s) => s.consumption === STANDARD_GAS)!
  if (stdPower.tariffs.length < 10 || stdGas.tariffs.length < 5) throw new Error('Zu wenige Tarife vom Tarifkalkulator')
  const day = dayNumber(now)
  const upsert = (list: [number, number, number][], set: TariffSet) => {
    const entry: [number, number, number] = [day, set.tariffs[0].annualTotal, median(set.tariffs.map((t) => t.annualTotal))]
    const i = list.findIndex((p) => p[0] === day)
    if (i >= 0) list[i] = entry
    else list.push(entry)
    return list
  }
  log(`tarife: ${stdPower.tariffs.length} Strom- und ${stdGas.tariffs.length} Gastarife`)
  return {
    updatedAt: now.toISOString(),
    zipCode: ZIP,
    power,
    gas,
    history: {
      power: upsert(previous?.history.power ?? [], stdPower),
      gas: upsert(previous?.history.gas ?? [], stdGas),
    },
  }
}
