/**
 * Datenvertrag zwischen Scraper (GitHub Actions) und Frontend.
 *
 * Alle Dateien liegen im Branch `data` und werden beim Deploy nach `/data/`
 * kopiert. Preise in Shops sind ganze Cent, Spritpreise Euro mit drei
 * Nachkommastellen (so wie an der Zapfsäule).
 */

export type FuelType = 'DIE' | 'SUP' | 'GAS'

export const FUEL_TYPES: FuelType[] = ['DIE', 'SUP', 'GAS']

export const FUEL_LABELS: Record<FuelType, string> = {
  DIE: 'Diesel',
  SUP: 'Super 95',
  GAS: 'CNG',
}

/** Tage seit 1970-01-01 (UTC). Kompakter als ISO-Strings. */
export type DayNumber = number

export interface FuelStation {
  id: number
  name: string
  address: string
  postalCode: string
  city: string
  district: string
  lat: number
  lon: number
  /** Öffnungszeiten je Wochentag (MO … SO, FE = Feiertag) als "06:00-22:00". */
  hours?: Partial<Record<string, string>>
}

export interface FuelStationsFile {
  updatedAt: string
  stations: FuelStation[]
}

/**
 * Aktueller Stand. `null` heißt: Tankstelle bietet die Sorte an, E-Control
 * veröffentlicht den Preis aber nicht (gehört nicht zur günstigeren Hälfte).
 */
export interface FuelLatestFile {
  updatedAt: string
  prices: Record<string, Partial<Record<FuelType, number | null>>>
  open: Record<string, boolean>
}

/** [Unix-Sekunden, Preis] – nur Änderungspunkte. */
export type FuelPoint = [number, number]

/** [Unix-Sekunden, Durchschnitt, Minimum, Anzahl Tankstellen mit Preis] */
export type FuelStatPoint = [number, number, number, number]

export interface FuelHistoryFile {
  updatedAt: string
  stations: Record<string, Partial<Record<FuelType, FuelPoint[]>>>
  stats: Partial<Record<FuelType, FuelStatPoint[]>>
}

export type StoreId = 'spar' | 'billa' | 'dm' | 'bipa' | 'obi'

export type StoreCategory = 'lebensmittel' | 'drogerie' | 'baumarkt'

export interface StoreInfo {
  id: StoreId
  name: string
  category: StoreCategory
  /** Vollständiges Online-Sortiment oder eine Auswahl über Suchbegriffe. */
  coverage: 'voll' | 'auswahl'
  count: number
  updatedAt: string | null
  /** Letzter Lauf fehlgeschlagen – Daten stammen vom letzten erfolgreichen Lauf. */
  stale?: boolean
  error?: string
}

export interface ShopIndexFile {
  updatedAt: string
  stores: StoreInfo[]
}

/**
 * Ein Produkt als Tupel, Reihenfolge siehe {@link PRODUCT_FIELDS}.
 * Tupel statt Objekte spart bei 100.000+ Produkten viel Bandbreite.
 */
export type ProductTuple = [
  id: string,
  name: string,
  brand: string,
  category: string,
  quantity: string,
  price: number,
  regularPrice: number,
  unitPrice: number,
  baseUnit: string,
  promo: string,
  url: string,
  image: string,
  previousPrice: number,
  changedDay: DayNumber,
  minPrice: number,
  maxPrice: number,
  firstSeenDay: DayNumber,
]

export const PRODUCT_FIELDS = [
  'id',
  'name',
  'brand',
  'category',
  'quantity',
  'price',
  'regularPrice',
  'unitPrice',
  'baseUnit',
  'promo',
  'url',
  'image',
  'previousPrice',
  'changedDay',
  'minPrice',
  'maxPrice',
  'firstSeenDay',
] as const

export interface ShopLatestFile {
  store: StoreId
  updatedAt: string
  day: DayNumber
  urlPrefix: string
  imagePrefix: string
  fields: typeof PRODUCT_FIELDS
  items: ProductTuple[]
}

/** Vorberechnete Auswahl für die Startseite (klein, damit sie schnell lädt). */
export interface HighlightsFile {
  updatedAt: string
  prefixes: Partial<Record<StoreId, { url: string; image: string }>>
  /** Größte Preissenkungen seit gestern */
  drops: { store: StoreId; item: ProductTuple }[]
  /** Höchste Rabatte auf den Normalpreis */
  deals: { store: StoreId; item: ProductTuple }[]
}

/** [Tag, Preis in Cent, 1 = Aktion] */
export type PricePoint = [DayNumber, number, 0 | 1]

/** Preisverlauf, aufgeteilt in Buckets, damit das Frontend nur einen kleinen Teil laden muss. */
export type ShopHistoryBucket = Record<string, PricePoint[]>

export const HISTORY_BUCKETS = 32

export interface SpotPriceFile {
  updatedAt: string
  /** [Unix-Sekunden Stundenbeginn, ct/kWh netto] */
  hours: [number, number][]
}

export interface DailySeriesFile {
  updatedAt: string
  unit: string
  source: string
  sourceUrl: string
  note?: string
  /** [Tag, Wert] */
  series: [DayNumber, number][]
}

export interface MonthlySeriesFile {
  updatedAt: string
  unit: string
  source: string
  sourceUrl: string
  note?: string
  /** ["2026-10", Wert] */
  series: [string, number][]
}

export interface Tariff {
  brand: string
  product: string
  /** Jahreskosten brutto in Euro inkl. Netz, Steuern und Abgaben. */
  annualTotal: number
  /** Davon Energie (Lieferant) brutto in Euro. */
  annualEnergy: number
  /** Energiepreis brutto in ct/kWh. */
  energyCt: number
  /** Grundgebühr Lieferant brutto in Euro pro Jahr. */
  baseFee: number
  guaranteeMonths: number | null
  /** Floater bzw. an Börsenpreis gekoppelt. */
  dynamic: boolean
}

export interface TariffSet {
  consumption: number
  gridOperator: string
  tariffs: Tariff[]
}

export interface TariffFile {
  updatedAt: string
  zipCode: string
  power: TariffSet[]
  gas: TariffSet[]
  /** [Tag, günstigster Jahrespreis, Median] für Standardverbrauch */
  history: { power: [DayNumber, number, number][]; gas: [DayNumber, number, number][] }
}

export interface SourceStatus {
  ok: boolean
  updatedAt: string | null
  message?: string
}

export interface MetaFile {
  updatedAt: string
  sources: Record<string, SourceStatus>
}

/* ---------- Push-Alarme (config/alerts.json im Haupt-Branch) ---------- */

export type AlertRule =
  | {
      id: string
      type: 'fuel'
      fuel: FuelType
      /** Euro pro Liter bzw. kg (CNG) */
      below: number
      /** Optional: nur diese Tankstellen-IDs, Postleitzahlen oder Bezirke. */
      stations?: number[]
      postalCodes?: string[]
      districts?: string[]
    }
  | { id: string; type: 'product'; store: StoreId; product: string; below: number }
  | { id: string; type: 'spot'; belowCt: number }
  | { id: string; type: 'heatingoil'; below: number }

export interface AlertsConfig {
  /** Basis-URL der Seite, wird in Nachrichten verlinkt. */
  siteUrl?: string
  rules: AlertRule[]
}

export type AlertsState = Record<string, { value: number; at: string }>

export function dayNumber(date: Date = new Date()): DayNumber {
  return Math.floor(date.getTime() / 86_400_000)
}

export function dayToDate(day: DayNumber): Date {
  return new Date(day * 86_400_000)
}

/** Stabiler, schneller String-Hash (FNV-1a) für die History-Buckets. */
export function historyBucket(productId: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < productId.length; i++) {
    h ^= productId.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) % HISTORY_BUCKETS
}
