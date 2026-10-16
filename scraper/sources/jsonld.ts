import { getText, setHostDelay } from '../lib/http'
import type { RawProduct } from '../lib/validate'
import { parseEuroCents, parseQuantity, unitPriceCents } from '../../shared/units'
import type { StoreId } from '../../shared/types'
import type { ShopSource } from './types'

/**
 * Händler ohne durchlaufbares Gesamtsortiment, deren Suchseiten aber
 * strukturierte Produktdaten (schema.org ItemList als JSON-LD) enthalten.
 * Erfasst wird eine Auswahl über konfigurierbare Suchbegriffe.
 *
 * (Müller wurde so ebenfalls versucht, sperrt automatisierte Abrufe aber
 * schon nach wenigen Anfragen – darum dort nur ein Link.)
 */

interface LdProduct {
  '@type'?: string
  name?: string
  url?: string
  sku?: string | number
  brand?: string | { name?: string }
  category?: string
  image?: string | string[]
  offers?: { price?: string | number } | { price?: string | number }[]
}

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m
    }
    return ENTITIES[code.toLowerCase()] ?? m
  })
}

/** Alle Produkte aus ItemList-Blöcken einer HTML-Seite. */
export function extractLdProducts(html: string): { products: LdProduct[]; numberOfItems: number | null } {
  const products: LdProduct[] = []
  let numberOfItems: number | null = null
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data: unknown
    try {
      data = JSON.parse(m[1])
    } catch {
      continue
    }
    const blocks = Array.isArray(data) ? data : [data]
    for (const b of blocks as Record<string, unknown>[]) {
      if (b?.['@type'] !== 'ItemList' || !Array.isArray(b.itemListElement)) continue
      if (typeof b.numberOfItems === 'number') numberOfItems = b.numberOfItems
      for (const el of b.itemListElement as { item?: LdProduct }[]) {
        if (el?.item?.['@type'] === 'Product') products.push(el.item)
      }
    }
  }
  return { products, numberOfItems }
}

export function mapLdProduct(p: LdProduct, base: string, idFromUrl: (url: string) => string): RawProduct | null {
  const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers
  const price = parseEuroCents(typeof offer?.price === 'string' ? offer.price.replace('.', ',') : offer?.price)
  if (!p.name || !p.url || !Number.isFinite(price)) return null
  const url = p.url.startsWith('http') ? p.url : base + p.url
  const name = decodeEntities(p.name)
  const q = parseQuantity(name)
  const brand = typeof p.brand === 'string' ? p.brand : (p.brand?.name ?? '')
  return {
    id: p.sku !== undefined && p.sku !== null && String(p.sku).trim() ? String(p.sku).trim() : idFromUrl(url),
    name,
    brand: decodeEntities(brand),
    category: decodeEntities(p.category ?? '').split(/[>|/]/)[0].trim(),
    quantity: '',
    price,
    unitPrice: unitPriceCents(price, q),
    baseUnit: q?.unit ?? '',
    url,
    image: Array.isArray(p.image) ? (p.image[0] ?? '') : (p.image ?? ''),
  }
}

interface JsonLdSourceConfig {
  id: StoreId
  host: string
  delayMs: number
  minCount: number
  urlPrefix: string
  imagePrefix: string
  terms: string[]
  searchUrl: (term: string, page: number) => string
  /** Seiten pro Begriff (1 = keine Paginierung möglich). */
  maxPages: number
  pageSize: number
  idFromUrl: (url: string) => string
  /** Kategorie, falls der Händler keine im JSON-LD liefert: der Suchbegriff. */
  categoryFromTerm?: boolean
}

export function jsonLdSource(cfg: JsonLdSourceConfig): ShopSource {
  return {
    id: cfg.id,
    urlPrefix: cfg.urlPrefix,
    imagePrefix: cfg.imagePrefix,
    minCount: cfg.minCount,
    async fetch(log) {
      setHostDelay(cfg.host, cfg.delayMs)
      const out = new Map<string, RawProduct>()
      let failures = 0
      for (const term of cfg.terms) {
        for (let page = 1; page <= cfg.maxPages; page++) {
          let html: string
          try {
            html = await getText(cfg.searchUrl(term, page), { timeoutMs: 90_000 })
          } catch (err) {
            failures++
            log(`${cfg.id}: "${term}" Seite ${page} fehlgeschlagen: ${(err as Error).message}`)
            if (failures > cfg.terms.length / 3) throw new Error(`${cfg.id}: zu viele Fehler`)
            break
          }
          const { products, numberOfItems } = extractLdProducts(html)
          let fresh = 0
          for (const p of products) {
            const mapped = mapLdProduct(p, `https://${cfg.host}`, cfg.idFromUrl)
            if (!mapped || out.has(mapped.id)) continue
            if (cfg.categoryFromTerm && !mapped.category) mapped.category = term.charAt(0).toUpperCase() + term.slice(1)
            out.set(mapped.id, mapped)
            fresh++
          }
          const total = numberOfItems ?? products.length
          // Abbrechen, wenn die Seite leer ist, nichts Neues bringt oder das Ende erreicht ist.
          if (!products.length || !fresh || page * cfg.pageSize >= total) break
        }
        log(`${cfg.id}: "${term}" → gesamt ${out.size}`)
      }
      return [...out.values()]
    },
  }
}

/** Baumarkt-Begriffe für OBI (eine Seite pro Begriff, keine Paginierung abrufbar). */
const OBI_TERMS = [
  'werkzeug', 'akkuschrauber', 'bohrmaschine', 'schleifer', 'säge', 'schrauben', 'dübel', 'farbe', 'wandfarbe',
  'lack', 'pinsel', 'tapete', 'laminat', 'vinylboden', 'fliesen', 'silikon', 'zement', 'holz', 'regal',
  'leuchtmittel', 'led', 'lampe', 'kabel', 'steckdose', 'verlängerungskabel', 'gartenschlauch', 'rasenmäher',
  'blumenerde', 'dünger', 'pflanzen', 'gartenmöbel', 'grill', 'holzkohle', 'heizlüfter', 'heizung', 'sanitär',
  'wasserhahn', 'dusche', 'wc', 'aufbewahrung', 'leiter', 'arbeitshandschuhe', 'schloss', 'briefkasten',
  'teppich', 'vorhang', 'streusalz', 'schneeschaufel', 'pellets', 'brennholz',
]

export const obi = jsonLdSource({
  id: 'obi',
  host: 'www.obi.at',
  delayMs: 2000,
  minCount: 800,
  urlPrefix: 'https://www.obi.at/p/',
  imagePrefix: 'https://bilder.obi.at/',
  terms: OBI_TERMS,
  searchUrl: (term) => `https://www.obi.at/search/${encodeURIComponent(term)}/`,
  maxPages: 1,
  pageSize: 90,
  idFromUrl: (url) => url.split('/p/')[1]?.split('/')[0] ?? url,
})
