/**
 * Validierung jeder Extraktion, bevor etwas gespeichert wird: Pflichtfelder,
 * plausible Preise, Duplikate und ein Abgleich mit dem letzten Lauf. Ein
 * kaputter Scraper soll nie die guten Daten von gestern überschreiben.
 */

export interface RawProduct {
  id: string
  name: string
  brand?: string
  category?: string
  quantity?: string
  /** Aktueller Preis in Cent */
  price: number
  /** Normalpreis in Cent, wenn gerade reduziert */
  regularPrice?: number
  /** Cent pro Basiseinheit */
  unitPrice?: number
  baseUnit?: string
  promo?: string
  url?: string
  image?: string
}

export interface ValidationReport {
  raw: number
  valid: number
  duplicates: number
  dropped: Record<string, number>
}

export class ValidationError extends Error {}

const MAX_PRICE_CENTS = 5_000_000 // 50.000 € – darüber ist es ein Parserfehler

export function validateProducts(
  raw: RawProduct[],
  opts: { minCount: number; previousCount?: number; maxDropRatio?: number },
): { items: RawProduct[]; report: ValidationReport } {
  const dropped: Record<string, number> = {}
  const drop = (reason: string) => (dropped[reason] = (dropped[reason] ?? 0) + 1)
  const seen = new Set<string>()
  let duplicates = 0
  const items: RawProduct[] = []

  for (const p of raw) {
    if (!p || typeof p.id !== 'string' || !p.id.trim()) {
      drop('ohne ID')
      continue
    }
    if (typeof p.name !== 'string' || !p.name.trim()) {
      drop('ohne Namen')
      continue
    }
    if (!Number.isInteger(p.price) || p.price <= 0 || p.price > MAX_PRICE_CENTS) {
      drop('ungültiger Preis')
      continue
    }
    const id = p.id.trim()
    if (seen.has(id)) {
      duplicates++
      continue
    }
    seen.add(id)
    const regular = p.regularPrice && p.regularPrice > p.price && p.regularPrice < MAX_PRICE_CENTS ? p.regularPrice : 0
    items.push({
      ...p,
      id,
      name: p.name.replace(/\s+/g, ' ').trim(),
      brand: p.brand?.replace(/\s+/g, ' ').trim() ?? '',
      regularPrice: regular,
      unitPrice: p.unitPrice && Number.isFinite(p.unitPrice) && p.unitPrice > 0 ? Math.round(p.unitPrice) : 0,
    })
  }

  const report: ValidationReport = { raw: raw.length, valid: items.length, duplicates, dropped }

  if (items.length < opts.minCount) {
    throw new ValidationError(`Nur ${items.length} gültige Produkte (mindestens ${opts.minCount} erwartet)`)
  }
  const maxDrop = opts.maxDropRatio ?? 0.4
  if (opts.previousCount && items.length < opts.previousCount * (1 - maxDrop)) {
    throw new ValidationError(
      `Produktanzahl von ${opts.previousCount} auf ${items.length} gefallen – vermutlich ist der Scraper kaputt`,
    )
  }
  return { items, report }
}

export function formatReport(store: string, r: ValidationReport): string {
  const drops = Object.entries(r.dropped)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
  return `${store}: ${r.valid} gültig von ${r.raw} (Duplikate: ${r.duplicates}${drops ? `, verworfen – ${drops}` : ''})`
}
