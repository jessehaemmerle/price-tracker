import {
  HISTORY_BUCKETS,
  PRODUCT_FIELDS,
  historyBucket,
  type DayNumber,
  type ProductTuple,
  type ShopHistoryBucket,
  type ShopLatestFile,
  type StoreId,
} from '../../shared/types'
import type { RawProduct } from './validate'

export interface MergeInput {
  store: StoreId
  day: DayNumber
  now: string
  urlPrefix: string
  imagePrefix: string
  items: RawProduct[]
  previous: ShopLatestFile | null
  buckets: ShopHistoryBucket[]
}

export interface MergeResult {
  latest: ShopLatestFile
  buckets: ShopHistoryBucket[]
  changed: number
  added: number
  removed: number
}

const strip = (value: string | undefined, prefix: string) =>
  value ? (prefix && value.startsWith(prefix) ? value.slice(prefix.length) : value) : ''

/**
 * Neuen Snapshot mit dem bisherigen Stand zusammenführen. Pro Produkt werden
 * nur Änderungspunkte in der Historie gespeichert (Preis oder Aktionsstatus
 * anders als zuletzt).
 */
export function mergeShopSnapshot(input: MergeInput): MergeResult {
  const { store, day, now, urlPrefix, imagePrefix, items, previous } = input
  const buckets =
    input.buckets.length === HISTORY_BUCKETS
      ? input.buckets.map((b) => ({ ...b }))
      : Array.from({ length: HISTORY_BUCKETS }, () => ({}) as ShopHistoryBucket)
  const prevById = new Map<string, ProductTuple>()
  for (const t of previous?.items ?? []) prevById.set(t[0], t)

  let changed = 0
  let added = 0
  const tuples: ProductTuple[] = []

  for (const p of items) {
    const prev = prevById.get(p.id)
    const promoFlag: 0 | 1 = p.regularPrice || p.promo ? 1 : 0
    const bucket = buckets[historyBucket(p.id)]
    const hist = (bucket[p.id] ??= [])
    const lastPoint = hist[hist.length - 1]
    if (!lastPoint || lastPoint[1] !== p.price || lastPoint[2] !== promoFlag) {
      if (lastPoint && lastPoint[0] === day) hist[hist.length - 1] = [day, p.price, promoFlag]
      else hist.push([day, p.price, promoFlag])
    }

    let previousPrice = 0
    let changedDay = day
    let minPrice = p.price
    let maxPrice = p.price
    let firstSeenDay = day
    if (prev) {
      firstSeenDay = prev[16]
      minPrice = Math.min(prev[14], p.price)
      maxPrice = Math.max(prev[15], p.price)
      if (prev[5] !== p.price) {
        previousPrice = prev[5]
        changedDay = day
        changed++
      } else {
        previousPrice = prev[12]
        changedDay = prev[13]
      }
    } else {
      added++
    }

    tuples.push([
      p.id,
      p.name,
      p.brand ?? '',
      p.category ?? '',
      p.quantity ?? '',
      p.price,
      p.regularPrice ?? 0,
      p.unitPrice ?? 0,
      p.baseUnit ?? '',
      p.promo ?? '',
      strip(p.url, urlPrefix),
      strip(p.image, imagePrefix),
      previousPrice,
      changedDay,
      minPrice,
      maxPrice,
      firstSeenDay,
    ])
  }

  const currentIds = new Set(items.map((p) => p.id))
  const removed = [...prevById.keys()].filter((id) => !currentIds.has(id)).length

  tuples.sort((a, b) => a[1].localeCompare(b[1], 'de'))

  return {
    latest: { store, updatedAt: now, day, urlPrefix, imagePrefix, fields: PRODUCT_FIELDS, items: tuples },
    buckets,
    changed,
    added,
    removed,
  }
}

/** Historie älter als `keepDays` kürzen, aber immer den letzten Punkt davor behalten. */
export function pruneHistory(buckets: ShopHistoryBucket[], today: DayNumber, keepDays = 730): void {
  const cutoff = today - keepDays
  for (const bucket of buckets) {
    for (const [id, points] of Object.entries(bucket)) {
      const firstKept = points.findIndex((p) => p[0] >= cutoff)
      if (firstKept === -1) bucket[id] = points.slice(-1)
      else if (firstKept > 1) bucket[id] = points.slice(firstKept - 1)
    }
  }
}
