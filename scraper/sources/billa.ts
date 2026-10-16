import { getJson, setHostDelay } from '../lib/http'
import type { RawProduct } from '../lib/validate'
import { unitFromString } from '../../shared/units'
import type { ShopSource } from './types'

const HOST = 'shop.billa.at'
const PAGE_SIZE = 500

interface BillaPrice {
  value: number
  perStandardizedQuantity?: number
  promotionQuantity?: number
  promotionText?: string
  promotionType?: string
}
export interface BillaProduct {
  sku: string
  name: string
  slug: string
  amount?: string
  volumeLabelShort?: string
  category?: string
  brand?: { name: string } | null
  images?: string[]
  inPromotion?: boolean
  price?: {
    baseUnitShort?: string
    basePriceFactor?: string
    crossed?: number
    regular?: BillaPrice
    standard?: BillaPrice
  }
}
interface BillaResponse {
  total: number
  count: number
  results: BillaProduct[]
}

const euro = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €'

/** Grundpreis von "Cent pro 100 g" o. ä. auf Cent pro Basiseinheit (kg, l, Stk) umrechnen. */
function unitPrice(perStd: number | undefined, factor: string | undefined, unit: string | undefined) {
  const u = unitFromString(unit ?? '')
  if (!perStd || !u) return { cents: 0, unit: '' }
  const amount = (Number(factor) || 1) * u.factor
  return { cents: Math.round(perStd / amount), unit: u.unit }
}

export function mapBillaProduct(p: BillaProduct): RawProduct | null {
  const regular = p.price?.regular
  if (!p.sku || !regular?.value) return null
  // Mengenaktionen ("Bei 6 Tafeln je 1,32 €") gelten nicht für ein einzelnes Stück:
  // Dann ist der Einzelpreis der Standardpreis, die Aktion steht im Hinweis.
  const multiBuy = (regular.promotionQuantity ?? 1) > 1
  const single = multiBuy ? (p.price?.standard ?? regular) : regular
  const crossed = p.price?.crossed ?? 0
  const promo = multiBuy
    ? `${regular.promotionText ?? 'Mengenaktion'} ${euro(regular.value)}`.trim()
    : crossed > single.value || p.inPromotion
      ? 'Aktion'
      : ''
  const up = unitPrice(single.perStandardizedQuantity, p.price?.basePriceFactor, p.price?.baseUnitShort)
  return {
    id: p.sku,
    name: p.name,
    brand: p.brand?.name ?? '',
    category: p.category ?? '',
    quantity: [p.amount, p.volumeLabelShort].filter(Boolean).join(' '),
    price: single.value,
    regularPrice: !multiBuy && crossed > single.value ? crossed : 0,
    unitPrice: up.cents,
    baseUnit: up.unit,
    promo,
    url: `https://shop.billa.at/produkte/${p.slug}`,
    image: p.images?.[0] ?? '',
  }
}

export const billa: ShopSource = {
  id: 'billa',
  urlPrefix: 'https://shop.billa.at/produkte/',
  imagePrefix: 'https://images.cdn.europe-west1.gcp.commercetools.com/',
  minCount: 3000,
  async fetch(log) {
    setHostDelay(HOST, 1500)
    const items: RawProduct[] = []
    let page = 0
    let total = Infinity
    while (page * PAGE_SIZE < total) {
      const url = `https://${HOST}/api/product-discovery/products?page=${page}&pageSize=${PAGE_SIZE}`
      const res = await getJson<BillaResponse>(url, { timeoutMs: 120_000 })
      total = res.total
      for (const p of res.results) {
        const mapped = mapBillaProduct(p)
        if (mapped) items.push(mapped)
      }
      log(`billa: Seite ${page + 1}/${Math.ceil(total / PAGE_SIZE)} (${items.length} von ${total})`)
      if (!res.results.length) break
      page++
    }
    return items
  },
}
