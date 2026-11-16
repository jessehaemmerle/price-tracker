import { getText, setHostDelay } from '../lib/http'
import type { RawProduct } from '../lib/validate'
import { parseQuantity, toNumber, unitFromString, unitPriceCents } from '../../shared/units'
import { decodeEntities } from './jsonld'
import type { ShopSource } from './types'

/**
 * Kaufland Lindau (Bodensee), direkt hinter der Grenze.
 *
 * Kaufland veröffentlicht online kein Gesamtsortiment mit Preisen, sondern nur
 * die Wochenangebote je Filiale. Die Angebotsseite bettet sie als JSON ein
 * (`window.SSR[...]`, Komponente "OfferTemplate"); die Filiale wird wie im
 * Browser über das Cookie `x-aem-variant` gewählt.
 */

const HOST = 'filiale.kaufland.de'
export const KAUFLAND_STORE = 'DE1593' // Lindau, Heuriedweg 21
const OFFERS_URL = `https://${HOST}/angebote/uebersicht.html`
const IMAGE_PREFIX = 'https://kaufland.media.schwarz/is/image/schwarz/'

export interface KauflandOffer {
  offerId: string
  klNr?: string
  title?: string
  subtitle?: string
  detailTitle?: string
  price?: number
  formattedOldPrice?: string | null
  basePrice?: string | null
  unit?: string | null
  listImage?: string
  salesFrom?: string
  salesTo?: string
  loyaltyFormattedPrice?: string | null
}

export interface KauflandCategory {
  displayName?: string
  main?: boolean
  offers?: KauflandOffer[]
}

export interface KauflandOfferData {
  cycles?: { categories?: KauflandCategory[] }[]
}

/** Die eingebetteten Angebotsdaten aus dem HTML der Angebotsseite lesen. */
export function extractOfferData(html: string): KauflandOfferData | null {
  for (const m of html.matchAll(/window\.SSR\['[^']+'\]\s*=\s*/g)) {
    const start = m.index + m[0].length
    const end = html.indexOf('</script>', start)
    if (end < 0) continue
    const raw = html.slice(start, end).trim().replace(/;$/, '')
    let parsed: { component?: string; props?: { offerData?: KauflandOfferData } }
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }
    if (parsed.component === 'OfferTemplate' && parsed.props?.offerData) return parsed.props.offerData
  }
  return null
}

const WEEKDAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.']

function parseIsoDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** "2026-11-14" → "Sa. 14.11." */
export function shortDay(iso: string): string {
  const d = parseIsoDay(iso)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`
}

/**
 * Stichtag für die Gültigkeit: heute, am Sonntag (Filiale geschlossen) der
 * Montag – dann zeigt die Seite bereits die Angebote der neuen Woche.
 */
export function referenceDay(today: string): string {
  const d = parseIsoDay(today)
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const BASE_PRICE_RE = /(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|St\.?|Stück|WL|m)\s*=\s*(\d+(?:[.,]\d+)?)(?![\d.,])(?!\s*-\s*\d)/i

/** Grundpreis aus "(1 kg = 4.48)" oder aus der Packungsangabe "je 400-g-Schale". */
export function kauflandUnitPrice(priceCents: number, basePrice: string | null | undefined, unit: string | null | undefined) {
  const m = basePrice?.match(BASE_PRICE_RE)
  if (m) {
    const u = unitFromString(m[2])
    if (u) return { cents: Math.round((toNumber(m[3]) * 100) / (toNumber(m[1]) * u.factor)), unit: u.unit as string }
  }
  // Preisspannen im Grundpreis ("1 l = 3.96 - 4.95") und Mengenspannen ("200 - 250-ml") sind nicht eindeutig.
  if (basePrice || !unit || /\d\s*-\s*\d/.test(unit)) return { cents: 0, unit: '' }
  const text = unit
    .replace(/^je\s*/i, '')
    .replace(/(\d)-(?=[a-zA-Z])/g, '$1 ')
    .replace(/([a-zA-Z])-(?=[A-ZÄÖÜ])/g, '$1 ')
  const bare = unitFromString(text)
  const q = bare && (bare.unit === 'kg' || bare.unit === 'l') ? { amount: bare.factor, unit: bare.unit } : parseQuantity(text)
  if (!q || q.unit === 'Stk') return { cents: 0, unit: '' }
  return { cents: unitPriceCents(priceCents, q), unit: q.unit as string }
}

const euro = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €'
const clean = (s: string | null | undefined) => decodeEntities(s ?? '').replace(/\s+/g, ' ').trim()

/** Marke und Produktname aus den drei Titel-Feldern zusammensetzen. */
export function kauflandName(o: KauflandOffer): { brand: string; name: string } {
  const detail = decodeEntities(o.detailTitle ?? '')
  const parts = detail
    .split(' ')
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (parts.length > 1) return { brand: parts[0], name: `${parts[0]} ${parts.slice(1).join(' ')}` }
  const title = clean(o.title)
  const subtitle = clean(o.subtitle)
  // Bei Kaufland-Card-Angeboten steht im Detailtitel nur "*Mit Kaufland Card".
  if (!parts.length || parts[0].startsWith('*')) {
    return subtitle ? { brand: title, name: `${title} ${subtitle}` } : { brand: '', name: title }
  }
  return { brand: '', name: parts[0] }
}

/**
 * Angebote in Produkte umwandeln: nur am Stichtag gültige, je Artikelnummer
 * einmal (dieselben Artikel stehen in mehreren Rubriken).
 */
export function mapKauflandOffers(data: KauflandOfferData, today: string): RawProduct[] {
  const ref = referenceDay(today)
  const byId = new Map<string, RawProduct>()
  for (const cycle of data.cycles ?? []) {
    for (const cat of cycle.categories ?? []) {
      const category = clean(cat.displayName).replace(/^Ab (Mo|Di|Mi|Do|Fr|Sa)\.:\s*/, '')
      for (const o of cat.offers ?? []) {
        if (!o.salesFrom || !o.salesTo || o.salesFrom > ref || o.salesTo < ref) continue
        if (typeof o.price !== 'number' || !(o.price > 0)) continue
        const id = (o.klNr ?? '').trim() || o.offerId
        const price = Math.round(o.price * 100)
        const old = o.formattedOldPrice ? Math.round(toNumber(o.formattedOldPrice) * 100) : 0
        const card = o.loyaltyFormattedPrice ? Math.round(toNumber(o.loyaltyFormattedPrice.replace('*', '')) * 100) : 0
        const { brand, name } = kauflandName(o)
        const up = kauflandUnitPrice(price, o.basePrice, o.unit)
        const validity = o.salesFrom > today ? `ab ${shortDay(o.salesFrom)}` : `bis ${shortDay(o.salesTo)}`
        const candidate: RawProduct = {
          id,
          name,
          brand,
          category: cat.main ? category : '',
          quantity: clean(o.unit).replace(/^je\s*/i, ''),
          price,
          regularPrice: old > price ? old : 0,
          unitPrice: up.cents,
          baseUnit: up.unit,
          promo: card > 0 && card < price ? `mit Kaufland Card ${euro(card)}, ${validity}` : `Angebot ${validity}`,
          url: OFFERS_URL,
          image: o.listImage ?? '',
        }
        const existing = byId.get(id)
        // "~" markiert Rubriken, die nur als Ersatz dienen, wenn der Artikel in keiner Warengruppe steht.
        if (!existing) byId.set(id, { ...candidate, category: candidate.category || `~${category}` })
        else if (candidate.price < existing.price) byId.set(id, { ...candidate, category: candidate.category || existing.category })
        else if (existing.category?.startsWith('~') && candidate.category) existing.category = candidate.category
      }
    }
  }
  return [...byId.values()].map((p) => ({ ...p, category: (p.category ?? '').replace(/^~/, '') }))
}

export const kaufland: ShopSource = {
  id: 'kaufland',
  urlPrefix: `https://${HOST}/`,
  imagePrefix: IMAGE_PREFIX,
  minCount: 100,
  // Die Zahl der Angebote schwankt von Woche zu Woche und innerhalb der Woche stark.
  maxDropRatio: 0.75,
  offersOnly: true,
  async fetch(log) {
    setHostDelay(HOST, 2000)
    const html = await getText(OFFERS_URL, { headers: { Cookie: `x-aem-variant=${KAUFLAND_STORE}` }, timeoutMs: 90_000 })
    const data = extractOfferData(html)
    if (!data) throw new Error('kaufland: Angebotsdaten nicht gefunden – Seitenaufbau geändert?')
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
    const items = mapKauflandOffers(data, today)
    log(`kaufland: ${items.length} gültige Angebote für Filiale ${KAUFLAND_STORE} (Stichtag ${referenceDay(today)})`)
    return items
  },
}
