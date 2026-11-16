import { describe, expect, it } from 'vitest'
import { HISTORY_BUCKETS, historyBucket } from '../shared/types'
import { mergeShopSnapshot } from '../scraper/lib/shopHistory'
import {
  extractOfferData,
  kauflandName,
  kauflandUnitPrice,
  mapKauflandOffers,
  referenceDay,
  shortDay,
  type KauflandOfferData,
} from '../scraper/sources/kaufland'

const offer = (extra: object) => ({
  offerId: 'ART.1_KAV.1',
  klNr: '0001',
  title: 'K-CLASSIC',
  detailTitle: 'K-CLASSIC&#x2028;Wiener Würstchen',
  price: 2.49,
  formattedOldPrice: '2.89',
  basePrice: '(1 kg = 6.23)',
  unit: 'je 8 St. = 400-g-Packg.',
  listImage: 'https://kaufland.media.schwarz/is/image/schwarz/abc',
  salesFrom: '2026-11-09',
  salesTo: '2026-11-14',
  ...extra,
})

describe('Kaufland Lindau', () => {
  it('liest die eingebetteten Angebotsdaten', () => {
    const html = `<script>window.SSR = window.SSR || {}; window.SSR['x-1'] = {"component":"Other","props":{}};</script>
      <script>window.SSR = window.SSR || {}; window.SSR['x-2'] = {"component":"OfferTemplate","props":{"offerData":{"cycles":[{"categories":[]}]}}};</script>`
    expect(extractOfferData(html)).toEqual({ cycles: [{ categories: [] }] })
    expect(extractOfferData('<html></html>')).toBeNull()
  })

  it('setzt Marke und Name zusammen', () => {
    expect(kauflandName(offer({}))).toEqual({ brand: 'K-CLASSIC', name: 'K-CLASSIC Wiener Würstchen' })
    expect(kauflandName(offer({ title: 'KINDER', subtitle: 'Pingui ', detailTitle: '*Mit Kaufland Card' }))).toEqual({ brand: 'KINDER', name: 'KINDER Pingui' })
    expect(kauflandName(offer({ title: 'Broccoli ', detailTitle: 'Broccoli' }))).toEqual({ brand: '', name: 'Broccoli' })
  })

  it('berechnet Grundpreise und meidet Spannen', () => {
    expect(kauflandUnitPrice(249, '(1 kg = 6.23)', 'je 400-g-Packg.')).toEqual({ cents: 623, unit: 'kg' })
    expect(kauflandUnitPrice(99, '(1 l = 3.96 - 4.95)', 'je 200 - 250-ml-Fl.')).toEqual({ cents: 0, unit: '' })
    expect(kauflandUnitPrice(179, null, 'je 400-g-Schale')).toEqual({ cents: 448, unit: 'kg' })
    expect(kauflandUnitPrice(399, null, 'je kg')).toEqual({ cents: 399, unit: 'kg' })
    expect(kauflandUnitPrice(99, null, 'je 100 g')).toEqual({ cents: 990, unit: 'kg' })
    expect(kauflandUnitPrice(1000, null, 'je Ka. 20 x 0,5-l-Fl.')).toEqual({ cents: 100, unit: 'l' })
    expect(kauflandUnitPrice(279, null, 'je')).toEqual({ cents: 0, unit: '' })
  })

  it('nimmt am Sonntag den Montag als Stichtag', () => {
    expect(referenceDay('2026-11-15')).toBe('2026-11-16')
    expect(referenceDay('2026-11-12')).toBe('2026-11-12')
    expect(shortDay('2026-11-14')).toBe('Sa. 14.11.')
  })

  const data: KauflandOfferData = {
    cycles: [
      {
        categories: [
          { displayName: 'Ab Mo.: Unsere Knüller', main: false, offers: [offer({})] },
          {
            displayName: 'Fleisch, Geflügel, Wurst',
            main: true,
            offers: [
              offer({}),
              offer({ klNr: '0002', detailTitle: '*Mit Kaufland Card', title: 'KINDER', subtitle: 'Pingui', loyaltyFormattedPrice: '2.22*' }),
              offer({ klNr: '0003', salesFrom: '2026-11-12' }),
              offer({ klNr: '0004', salesFrom: '2026-11-16', salesTo: '2026-11-21' }),
            ],
          },
        ],
      },
    ],
  }

  it('übernimmt nur gültige Angebote, je Artikel einmal', () => {
    const items = mapKauflandOffers(data, '2026-11-10')
    expect(items.map((i) => i.id)).toEqual(['0001', '0002'])
    expect(items[0]).toMatchObject({
      name: 'K-CLASSIC Wiener Würstchen',
      category: 'Fleisch, Geflügel, Wurst',
      price: 249,
      regularPrice: 289,
      unitPrice: 623,
      baseUnit: 'kg',
      quantity: '8 St. = 400-g-Packg.',
      promo: 'Angebot bis Sa. 14.11.',
    })
    expect(items[1].promo).toBe('mit Kaufland Card 2,22 €, bis Sa. 14.11.')
    expect(mapKauflandOffers(data, '2026-11-12').map((i) => i.id)).toEqual(['0001', '0002', '0003'])
  })

  it('zeigt am Sonntag die Angebote ab Montag mit Hinweis', () => {
    const items = mapKauflandOffers(data, '2026-11-15')
    expect(items.map((i) => i.id)).toEqual(['0004'])
    expect(items[0].promo).toBe('Angebot ab Mo. 16.11.')
  })
})

describe('Verlauf bei Angebots-Händlern', () => {
  const base = { store: 'kaufland' as const, now: '', urlPrefix: '', imagePrefix: '', markRemoved: true }
  const p = (price: number) => ({ id: 'a', name: 'A', price, promo: 'Angebot' })

  it('markiert das Angebotsende als Lücke und stellt Kennzahlen bei Rückkehr wieder her', () => {
    const w1 = mergeShopSnapshot({ ...base, day: 100, items: [p(199)], previous: null, buckets: [] })
    const gone = mergeShopSnapshot({ ...base, day: 107, items: [], previous: w1.latest, buckets: w1.buckets })
    const hist = () => gone.buckets[historyBucket('a')]['a']
    expect(gone.buckets).toHaveLength(HISTORY_BUCKETS)
    expect(hist()).toEqual([
      [100, 199, 1],
      [107, 0, 0],
    ])
    // noch immer weg: keine zweite Lücke
    const still = mergeShopSnapshot({ ...base, day: 108, items: [], previous: gone.latest, buckets: gone.buckets })
    expect(still.buckets[historyBucket('a')]['a']).toHaveLength(2)

    const back = mergeShopSnapshot({ ...base, day: 121, items: [p(149)], previous: still.latest, buckets: still.buckets })
    expect(back.buckets[historyBucket('a')]['a']).toEqual([
      [100, 199, 1],
      [107, 0, 0],
      [121, 149, 1],
    ])
    const t = back.latest.items[0]
    expect(t[12]).toBe(0) // kein "seit gestern billiger" gegenüber einem Wochen alten Angebot
    expect(t[14]).toBe(149)
    expect(t[15]).toBe(199)
    expect(t[16]).toBe(100)
  })

  it('lässt den Verlauf anderer Händler unverändert', () => {
    const a = mergeShopSnapshot({ ...base, markRemoved: false, day: 1, items: [p(100)], previous: null, buckets: [] })
    const b = mergeShopSnapshot({ ...base, markRemoved: false, day: 2, items: [], previous: a.latest, buckets: a.buckets })
    expect(b.buckets[historyBucket('a')]['a']).toEqual([[1, 100, 1]])
  })
})
