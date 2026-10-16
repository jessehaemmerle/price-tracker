/**
 * Mengenangaben aus Produktnamen und Händlerfeldern normalisieren, damit
 * Grundpreise (€/kg, €/l, €/Stk) über Händler hinweg vergleichbar werden.
 */

export type BaseUnit = 'kg' | 'l' | 'Stk' | 'm' | 'm²' | 'WL'

export interface Quantity {
  amount: number
  unit: BaseUnit
}

const UNIT_MAP: Record<string, { unit: BaseUnit; factor: number }> = {
  kg: { unit: 'kg', factor: 1 },
  kilogramm: { unit: 'kg', factor: 1 },
  g: { unit: 'kg', factor: 0.001 },
  gr: { unit: 'kg', factor: 0.001 },
  gramm: { unit: 'kg', factor: 0.001 },
  dag: { unit: 'kg', factor: 0.01 },
  l: { unit: 'l', factor: 1 },
  liter: { unit: 'l', factor: 1 },
  lt: { unit: 'l', factor: 1 },
  ltr: { unit: 'l', factor: 1 },
  ml: { unit: 'l', factor: 0.001 },
  milliliter: { unit: 'l', factor: 0.001 },
  cl: { unit: 'l', factor: 0.01 },
  dl: { unit: 'l', factor: 0.1 },
  stk: { unit: 'Stk', factor: 1 },
  st: { unit: 'Stk', factor: 1 },
  stück: { unit: 'Stk', factor: 1 },
  stueck: { unit: 'Stk', factor: 1 },
  pieces: { unit: 'Stk', factor: 1 },
  paar: { unit: 'Stk', factor: 1 },
  blatt: { unit: 'Stk', factor: 1 },
  bl: { unit: 'Stk', factor: 1 },
  tabs: { unit: 'Stk', factor: 1 },
  m: { unit: 'm', factor: 1 },
  meter: { unit: 'm', factor: 1 },
  cm: { unit: 'm', factor: 0.01 },
  'm²': { unit: 'm²', factor: 1 },
  m2: { unit: 'm²', factor: 1 },
  qm: { unit: 'm²', factor: 1 },
  wl: { unit: 'WL', factor: 1 },
  waschladungen: { unit: 'WL', factor: 1 },
}

const UNIT_PATTERN = Object.keys(UNIT_MAP)
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const MULTI_RE = new RegExp(`(\\d+)\\s*[x×]\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})(?![a-zäöü])`, 'i')
const SINGLE_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})(?![a-zäöü0-9])`, 'gi')
const UNIT_PRICE_RE = /(\d+(?:[.,]\d+)?)\s*€\s*(?:je|\/|pro)\s*(\d+(?:[.,]\d+)?)?\s*([a-zA-Zäöü²]+)/
const BIPA_UNIT_PRICE_RE = /^(\d+(?:[.,]\d+)?)\s*([a-zA-Zäöü²]+)\s+(\d+(?:[.,]\d+)?)$/

/**
 * Deutsche oder englische Dezimalschreibweise lesen ("1,5", "1.5", "1.234,50").
 * Ein Punkt gilt nur dann als Tausendertrenner, wenn es eindeutig ist (danach
 * folgt ein Dezimalkomma oder es gibt mehrere Dreiergruppen) – "1.599" ist 1,599.
 */
export function toNumber(s: string): number {
  let v = s.trim()
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(v) || /^\d{1,3}(\.\d{3}){2,}$/.test(v)) v = v.replace(/\./g, '')
  return Number.parseFloat(v.replace(',', '.'))
}

export function unitFromString(raw: string): { unit: BaseUnit; factor: number } | null {
  return UNIT_MAP[raw.trim().toLowerCase().replace(/\.$/, '')] ?? null
}

/**
 * Sucht die Menge in einem freien Text, z. B. "Bio-Karotten 400g",
 * "6 x 0,5 l", "Waschmittel 20 WL", "250 ml". Bei mehreren Angaben gewinnt
 * die letzte, weil Händler die Packungsgröße meist ans Ende stellen.
 */
export function parseQuantity(text: string): Quantity | null {
  if (!text) return null
  const t = text.replace(/ /g, ' ')
  const multi = t.match(MULTI_RE)
  if (multi) {
    const u = unitFromString(multi[3])
    if (u) return { amount: Number(multi[1]) * toNumber(multi[2]) * u.factor, unit: u.unit }
  }
  let last: Quantity | null = null
  for (const m of t.matchAll(SINGLE_RE)) {
    const u = unitFromString(m[2])
    if (!u) continue
    const amount = toNumber(m[1]) * u.factor
    if (amount > 0) last = { amount, unit: u.unit }
  }
  return last
}

/** Grundpreis in Cent pro Basiseinheit (gerundet). 0 wenn unbekannt. */
export function unitPriceCents(priceCents: number, q: Quantity | null): number {
  if (!q || q.amount <= 0 || !Number.isFinite(q.amount)) return 0
  return Math.round(priceCents / q.amount)
}

/**
 * Grundpreis-Angaben der Händler lesen, z. B. "4.03 €/kg", "3,50 € je 1 kg",
 * "0,50 € /Stk" oder BIPA-Format "100 ml 10,65" (Preis für 100 ml).
 * Ergebnis: Cent pro Basiseinheit.
 */
export function parseUnitPriceString(raw: string): { cents: number; unit: BaseUnit } | null {
  if (!raw) return null
  const s = raw.replace(/ /g, ' ').trim()
  let m = s.match(UNIT_PRICE_RE)
  if (m) {
    const u = unitFromString(m[3])
    if (!u) return null
    const per = m[2] ? toNumber(m[2]) : 1
    return { cents: Math.round((toNumber(m[1]) * 100) / (per * u.factor)), unit: u.unit }
  }
  m = s.match(BIPA_UNIT_PRICE_RE)
  if (m) {
    const u = unitFromString(m[2])
    if (!u) return null
    return { cents: Math.round((toNumber(m[3]) * 100) / (toNumber(m[1]) * u.factor)), unit: u.unit }
  }
  return null
}

/** Euro-Preis-String ("1,99 €", "€ 1.99", "1.99") in Cent. NaN wenn unlesbar. */
export function parseEuroCents(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return Number.NaN
  if (typeof raw === 'number') return Math.round(raw * 100)
  const m = raw.replace(/ /g, ' ').match(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?/)
  return m ? Math.round(toNumber(m[0]) * 100) : Number.NaN
}
