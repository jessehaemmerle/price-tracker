import { normalize, type Product } from './data'

export type SortKey = 'relevanz' | 'preis' | 'grundpreis' | 'rabatt'

export function tokens(query: string): string[] {
  return normalize(query).split(' ').filter((t) => t.length > 0)
}

/** Treffer-Bewertung: Wortanfang und ganze Wörter zählen mehr als Teilstrings. */
export function score(p: Product, toks: string[]): number {
  let s = 0
  for (const t of toks) {
    const idx = p.haystack.indexOf(t)
    if (idx < 0) return -1
    if (p.haystack[idx - 1] === ' ') s += 2
    const after = p.haystack[idx + t.length]
    if (after === ' ' || after === undefined) s += 2
    s += 1
  }
  // Kürzere Namen sind meist genauere Treffer ("Milch" vor "Milchschokolade Riegel").
  return s - Math.min(p.haystack.length, 120) / 120
}

export function discount(p: Product): number {
  return p.regularPrice > p.price ? (1 - p.price / p.regularPrice) * 100 : 0
}

export function searchProducts(products: Product[], query: string, sort: SortKey = 'relevanz', limit = 200): Product[] {
  const toks = tokens(query)
  if (!toks.length) return []
  const scored: { p: Product; s: number }[] = []
  for (const p of products) {
    const s = score(p, toks)
    if (s >= 0) scored.push({ p, s })
  }
  const cmp: Record<SortKey, (a: { p: Product; s: number }, b: { p: Product; s: number }) => number> = {
    relevanz: (a, b) => b.s - a.s || a.p.price - b.p.price,
    preis: (a, b) => a.p.price - b.p.price,
    grundpreis: (a, b) => (a.p.unitPrice || Infinity) - (b.p.unitPrice || Infinity) || a.p.price - b.p.price,
    rabatt: (a, b) => discount(b.p) - discount(a.p) || a.p.price - b.p.price,
  }
  scored.sort(cmp[sort])
  return scored.slice(0, limit).map((x) => x.p)
}

/** Ähnliche Produkte bei anderen Händlern (gleiche markante Wörter im Namen). */
export function similarProducts(target: Product, products: Product[], limit = 8): Product[] {
  const stop = new Set(['und', 'mit', 'der', 'die', 'das', 'fuer', 'von', 'bio', 'stk', 'pkg', 'g', 'kg', 'ml', 'l'])
  const words = normalize(target.name)
    .split(' ')
    .filter((w) => w.length > 2 && !stop.has(w) && !/^\d/.test(w))
    .slice(0, 4)
  if (!words.length) return []
  const brand = normalize(target.brand)
  return products
    .filter((p) => p.store !== target.store)
    .map((p) => {
      const hits = words.filter((w) => p.haystack.includes(' ' + w)).length
      const sameBrand = brand && p.haystack.includes(' ' + brand) ? 1 : 0
      const sameUnit = target.baseUnit && p.baseUnit === target.baseUnit ? 0.5 : 0
      return { p, s: hits / words.length + sameBrand * 0.5 + sameUnit }
    })
    .filter((x) => x.s >= 0.75)
    .sort((a, b) => b.s - a.s || (a.p.unitPrice || a.p.price) - (b.p.unitPrice || b.p.price))
    .slice(0, limit)
    .map((x) => x.p)
}
