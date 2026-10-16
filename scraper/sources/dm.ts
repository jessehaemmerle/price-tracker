import { getJson, setHostDelay } from '../lib/http'
import type { RawProduct } from '../lib/validate'
import { parseEuroCents, parseQuantity, parseUnitPriceString, unitPriceCents } from '../../shared/units'
import type { Logger, ShopSource } from './types'

const HOST = 'product-search.services.dmtech.com'
const BASE = `https://${HOST}/at/search/crawl`
/** Die API liefert pro Abfrage höchstens 1000 Treffer – darum nach Preisbereichen aufteilen. */
const MAX_PER_QUERY = 1000

export interface DmProduct {
  dan: number
  gtin?: number
  brandName?: string
  title: string
  tileData: {
    self: string
    price: {
      price: { current: { value: string }; previous?: { value: string } }
      tileInfos?: string[]
    }
    images?: { tileSrc: string }[]
    trackingData?: { categories?: string[]; price?: number }
    eyecatchers?: { alt?: string }[]
  }
}
interface DmResponse {
  count: number
  products: DmProduct[]
}

export function mapDmProduct(p: DmProduct): RawProduct | null {
  const price = parseEuroCents(p.tileData.price.price.current.value)
  if (!Number.isFinite(price)) return null
  const previous = parseEuroCents(p.tileData.price.price.previous?.value)
  const infos = p.tileData.price.tileInfos ?? []
  // "0,1 kg (3,50 € je 1 kg)" – Menge vor der Klammer, Grundpreis in der Klammer.
  const qtyInfo = infos.find((i) => i.includes('(')) ?? infos.find((i) => !/pfand/i.test(i)) ?? ''
  const unit = parseUnitPriceString(qtyInfo.match(/\(([^)]*)\)/)?.[1] ?? '')
  const quantity = qtyInfo.replace(/\(.*\)/, '').trim()
  const q = unit ? null : parseQuantity(quantity || p.title)
  const reduced = Number.isFinite(previous) && previous > price
  return {
    id: String(p.dan),
    name: p.title,
    brand: p.brandName ?? '',
    category: p.tileData.trackingData?.categories?.[0] ?? '',
    quantity,
    price,
    regularPrice: reduced ? previous : 0,
    unitPrice: unit?.cents ?? unitPriceCents(price, q),
    baseUnit: unit?.unit ?? q?.unit ?? '',
    promo: reduced ? 'Aktion' : '',
    url: `https://www.dm.at${p.tileData.self}`,
    image: p.tileData.images?.[0]?.tileSrc ?? '',
  }
}

async function query(from: number, to: number, pageSize: number): Promise<DmResponse> {
  const url = `${BASE}?pageSize=${pageSize}&currentPage=0&type=search-static&sort=price_asc&price.value.from=${from.toFixed(2)}&price.value.to=${to.toFixed(2)}`
  return getJson<DmResponse>(url, { skipRobots: true, timeoutMs: 90_000 })
}

/** Preisbereich so lange halbieren, bis jede Abfrage unter dem Limit liegt. */
async function collect(from: number, to: number, out: Map<string, RawProduct>, log: Logger): Promise<void> {
  const probe = await query(from, to, 1)
  if (probe.count === 0) return
  if (probe.count <= MAX_PER_QUERY || to - from < 0.02) {
    const res = await query(from, to, MAX_PER_QUERY)
    for (const p of res.products) {
      const mapped = mapDmProduct(p)
      if (mapped) out.set(mapped.id, mapped)
    }
    log(`dm: ${from.toFixed(2)}–${to.toFixed(2)} € → ${res.products.length} (gesamt ${out.size})`)
    return
  }
  const mid = Math.floor(((from + to) / 2) * 100) / 100
  await collect(from, mid, out, log)
  await collect(mid + 0.01, to, out, log)
}

export const dm: ShopSource = {
  id: 'dm',
  urlPrefix: 'https://www.dm.at/p/',
  imagePrefix: 'https://products.dm-static.com/images/f_auto,q_auto,c_fit,h_320,w_320/',
  minCount: 5000,
  async fetch(log) {
    setHostDelay(HOST, 3000)
    const out = new Map<string, RawProduct>()
    // Startbänder nach typischer Preisverteilung – spart Teilungs-Abfragen.
    const bands: [number, number][] = [[0, 1.99], [2, 3.99], [4, 6.99], [7, 11.99], [12, 24.99], [25, 100_000]]
    for (const [from, to] of bands) await collect(from, to, out, log)
    return [...out.values()]
  },
}
