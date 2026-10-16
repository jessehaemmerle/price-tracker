import { getJson, setHostDelay } from '../lib/http'
import type { RawProduct } from '../lib/validate'
import { parseEuroCents, parseQuantity, parseUnitPriceString, unitPriceCents } from '../../shared/units'
import type { ShopSource } from './types'

const HOST = 'search-spar.spar-ics.com'
const BASE = `https://${HOST}/fact-finder/rest/v4/search/products_lmos_at`
const PAGE_SIZE = 2000

interface SparHit {
  masterValues: Record<string, unknown>
}
interface SparResponse {
  totalHits: number
  paging: { currentPage: number; pageCount: number }
  hits: SparHit[]
}

const str = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : v == null ? '' : String(v))

/** Oberste Kategorie aus Einträgen wie "root_Produkte:F2_Kühlregal". */
function topCategory(categories: unknown): string {
  if (!Array.isArray(categories)) return ''
  const root = categories.find((c) => typeof c === 'string' && c.startsWith('root_'))
  return root ? String(root).split(':')[1]?.replace(/^[^_]*_/, '') ?? '' : ''
}

export function mapSparHit(hit: SparHit): RawProduct | null {
  const v = hit.masterValues
  const id = str(v['product-number'])
  const price = parseEuroCents(v['price'] as number)
  if (!id || !Number.isFinite(price)) return null
  const regular = parseEuroCents(v['regular-price'] as number)
  const productName = str(v['short-description']) || str(v['name'])
  const quantity = str(v['short-description-3'])
  const unit = parseUnitPriceString(str(v['price-per-unit']))
  const q = unit ? null : parseQuantity(`${productName} ${quantity}`)
  const promo = regular > price ? 'Aktion' : v['is-on-promotion'] === 'true' ? 'Aktion' : ''
  return {
    id,
    name: productName,
    brand: str(v['brand']) || str(v['title']),
    category: topCategory(v['categories']),
    quantity: quantity.toLowerCase(),
    price,
    regularPrice: regular > price ? regular : 0,
    unitPrice: unit?.cents ?? unitPriceCents(price, q),
    baseUnit: unit?.unit ?? q?.unit ?? '',
    promo,
    url: `https://www.interspar.at/shop/lebensmittel${str(v['url'])}`,
    image: str(v['image-url']),
  }
}

export const spar: ShopSource = {
  id: 'spar',
  urlPrefix: 'https://www.interspar.at/shop/lebensmittel',
  imagePrefix: 'https://cdn1.interspar.at/cachableservlets/articleImage.dam/at/',
  minCount: 5000,
  async fetch(log) {
    setHostDelay(HOST, 1000)
    const items: RawProduct[] = []
    let page = 1
    let pageCount = 1
    do {
      const url = `${BASE}?query=*&q=*&page=${page}&hitsPerPage=${PAGE_SIZE}`
      const res = await getJson<SparResponse>(url, { skipRobots: true, timeoutMs: 120_000 })
      pageCount = res.paging.pageCount
      for (const hit of res.hits) {
        const p = mapSparHit(hit)
        if (p) items.push(p)
      }
      log(`spar: Seite ${page}/${pageCount} (${items.length} von ${res.totalHits})`)
      page++
    } while (page <= pageCount)
    return items
  },
}
