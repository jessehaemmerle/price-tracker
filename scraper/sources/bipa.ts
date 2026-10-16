import { getText, setHostDelay } from '../lib/http'
import type { RawProduct } from '../lib/validate'
import { parseEuroCents, parseQuantity, parseUnitPriceString, unitPriceCents } from '../../shared/units'
import type { ShopSource } from './types'

const HOST = 'www.bipa.at'
const PAGE_SIZE = 200

export interface BipaHit {
  productId: string
  productName: string
  c_brand?: string
  c_category?: string
  c_inhalt?: string
  c_displayedPrice?: number
  c_insteadPrice?: string
  c_basePrice?: string
  c_effectiveCornerBadges?: string[]
  image?: { link?: string }
}

interface BipaSearchResult {
  total: number
  offset: number
  hits: BipaHit[]
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Der PWA-Kit-Shop bettet das Suchergebnis als JSON in `<script id="mobify-data">` ein. */
export function extractBipaResult(html: string): BipaSearchResult | null {
  const m = html.match(/<script id="mobify-data"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  const data: unknown = JSON.parse(m[1])
  const stack: unknown[] = [data]
  while (stack.length) {
    const o = stack.pop()
    if (Array.isArray(o)) stack.push(...o)
    else if (o && typeof o === 'object') {
      const rec = o as Record<string, unknown>
      if (Array.isArray(rec.hits) && typeof rec.total === 'number') return rec as unknown as BipaSearchResult
      stack.push(...Object.values(rec))
    }
  }
  return null
}

const humanCategory = (c: string | undefined) => {
  const top = (c ?? '').split('-')[0]
  return top ? top.charAt(0).toUpperCase() + top.slice(1) : ''
}

export function mapBipaHit(h: BipaHit): RawProduct | null {
  const price = parseEuroCents(h.c_displayedPrice)
  if (!h.productId || !Number.isFinite(price)) return null
  const instead = parseEuroCents(h.c_insteadPrice || null)
  const unit = parseUnitPriceString(h.c_basePrice ?? '')
  const q = unit ? null : parseQuantity(h.c_inhalt ?? h.productName)
  const badges = (h.c_effectiveCornerBadges ?? []).filter((b) => !/online only|neu/i.test(b))
  const reduced = Number.isFinite(instead) && instead > price
  return {
    id: h.productId,
    name: h.productName,
    brand: h.c_brand ?? '',
    category: humanCategory(h.c_category),
    quantity: h.c_inhalt ?? '',
    price,
    regularPrice: reduced ? instead : 0,
    unitPrice: unit?.cents ?? unitPriceCents(price, q),
    baseUnit: unit?.unit ?? q?.unit ?? '',
    promo: reduced ? 'Aktion' : badges.join(', '),
    url: `https://www.bipa.at/p/${slugify(h.productName)}/${h.productId}`,
    image: h.image?.link ?? '',
  }
}

export const bipa: ShopSource = {
  id: 'bipa',
  urlPrefix: 'https://www.bipa.at/p/',
  imagePrefix: 'https://www.bipa.at/on/demandware.static/-/Sites-catalog/de_AT/',
  minCount: 5000,
  async fetch(log) {
    setHostDelay(HOST, 1500)
    const items: RawProduct[] = []
    let offset = 0
    let total = Infinity
    while (offset < total) {
      const html = await getText(`https://${HOST}/c/navigation?limit=${PAGE_SIZE}&offset=${offset}`, { timeoutMs: 90_000 })
      const res = extractBipaResult(html)
      if (!res) throw new Error(`bipa: kein Suchergebnis im HTML bei offset=${offset}`)
      total = res.total
      for (const h of res.hits) {
        const mapped = mapBipaHit(h)
        if (mapped) items.push(mapped)
      }
      log(`bipa: ${Math.min(offset + PAGE_SIZE, total)}/${total}`)
      if (!res.hits.length) break
      offset += PAGE_SIZE
    }
    return items
  },
}
