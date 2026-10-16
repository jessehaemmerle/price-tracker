import type { StoreId } from '../../shared/types'
import type { Product } from './data'
import { score, tokens } from './search'

export interface BasketItem {
  id: string
  /** Suchbegriff, z. B. "Vollmilch 1 l" */
  query: string
  qty: number
  /** Vom Nutzer gewähltes Produkt je Händler (Produkt-ID) */
  picks: Partial<Record<StoreId, string>>
}

export interface BasketCell {
  chosen: Product | null
  candidates: Product[]
}

export interface StoreTotal {
  store: StoreId
  total: number
  found: number
}

/**
 * Für jeden Händler das passende Produkt je Position wählen: die eigene Wahl,
 * sonst das günstigste unter den besten Treffern (nach Grundpreis, wenn die
 * Einheiten vergleichbar sind).
 */
export function matchItem(item: BasketItem, storeProducts: Product[], store: StoreId): BasketCell {
  const toks = tokens(item.query)
  if (!toks.length) return { chosen: null, candidates: [] }
  const scored = storeProducts
    .map((p) => ({ p, s: score(p, toks) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
  if (!scored.length) return { chosen: null, candidates: [] }
  const best = scored[0].s
  const top = scored.filter((x) => x.s >= best - 1.5).map((x) => x.p)
  const unit = top[0].baseUnit
  const comparable = unit && top.filter((p) => p.baseUnit === unit && p.unitPrice > 0).length >= Math.ceil(top.length / 2)
  const byValue = [...top].sort((a, b) =>
    comparable ? (a.unitPrice || Infinity) - (b.unitPrice || Infinity) || a.price - b.price : a.price - b.price,
  )
  const candidates = [...byValue, ...scored.map((x) => x.p).filter((p) => !top.includes(p))].slice(0, 12)
  const pickedId = item.picks[store]
  const picked = pickedId ? storeProducts.find((p) => p.id === pickedId) : undefined
  return { chosen: picked ?? byValue[0] ?? null, candidates: picked && !candidates.includes(picked) ? [picked, ...candidates] : candidates }
}

export function compareBasket(
  items: BasketItem[],
  byStore: Map<StoreId, Product[]>,
): { cells: Map<StoreId, BasketCell[]>; totals: StoreTotal[] } {
  const cells = new Map<StoreId, BasketCell[]>()
  const totals: StoreTotal[] = []
  for (const [store, products] of byStore) {
    const row = items.map((it) => matchItem(it, products, store))
    cells.set(store, row)
    let total = 0
    let found = 0
    row.forEach((c, i) => {
      if (c.chosen) {
        total += c.chosen.price * items[i].qty
        found++
      }
    })
    totals.push({ store, total, found })
  }
  // Vollständige Warenkörbe zuerst, dann nach Summe.
  totals.sort((a, b) => b.found - a.found || a.total - b.total)
  return { cells, totals }
}

export function newBasketItem(query: string): BasketItem {
  return { id: Math.random().toString(36).slice(2, 10), query: query.trim(), qty: 1, picks: {} }
}
