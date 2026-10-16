import { describe, expect, it } from 'vitest'
import { HISTORY_BUCKETS, historyBucket, type ShopLatestFile } from '../shared/types'
import { parseRobots, robotsAllows } from '../scraper/lib/http'
import { mergeShopSnapshot, pruneHistory } from '../scraper/lib/shopHistory'
import { ValidationError, validateProducts, type RawProduct } from '../scraper/lib/validate'

const product = (id: string, price: number, extra: Partial<RawProduct> = {}): RawProduct => ({
  id,
  name: `Produkt ${id}`,
  price,
  url: `https://shop.example/p/${id}`,
  image: `https://img.example/${id}.jpg`,
  ...extra,
})

describe('validateProducts', () => {
  it('verwirft ungültige Einträge und Duplikate', () => {
    const raw = [product('1', 199), product('1', 199), product('2', 0), product('', 100), product('3', Number.NaN), product('4', 250)]
    const { items, report } = validateProducts(raw, { minCount: 1 })
    expect(items.map((i) => i.id)).toEqual(['1', '4'])
    expect(report.duplicates).toBe(1)
    expect(report.dropped['ungültiger Preis']).toBe(2)
    expect(report.dropped['ohne ID']).toBe(1)
  })
  it('lehnt zu kleine Ergebnisse ab', () => {
    expect(() => validateProducts([product('1', 100)], { minCount: 10 })).toThrow(ValidationError)
  })
  it('lehnt starken Einbruch gegenüber dem letzten Lauf ab', () => {
    const raw = Array.from({ length: 50 }, (_, i) => product(String(i), 100))
    expect(() => validateProducts(raw, { minCount: 1, previousCount: 100 })).toThrow(/gefallen/)
    expect(validateProducts(raw, { minCount: 1, previousCount: 70 }).items).toHaveLength(50)
  })
  it('ignoriert Normalpreise, die nicht über dem Preis liegen', () => {
    const { items } = validateProducts([product('1', 200, { regularPrice: 150 })], { minCount: 1 })
    expect(items[0].regularPrice).toBe(0)
  })
})

describe('mergeShopSnapshot', () => {
  const base = { store: 'spar' as const, now: '2026-10-16T00:00:00Z', urlPrefix: 'https://shop.example/p/', imagePrefix: 'https://img.example/' }

  it('legt neue Produkte mit Historie an und kürzt URLs', () => {
    const r = mergeShopSnapshot({ ...base, day: 100, items: [product('a', 199)], previous: null, buckets: [] })
    expect(r.added).toBe(1)
    expect(r.buckets).toHaveLength(HISTORY_BUCKETS)
    const t = r.latest.items[0]
    expect(t[10]).toBe('a')
    expect(t[11]).toBe('a.jpg')
    expect(r.buckets[historyBucket('a')]['a']).toEqual([[100, 199, 0]])
  })

  it('merkt sich Preisänderungen, Minimum und Maximum', () => {
    const first = mergeShopSnapshot({ ...base, day: 100, items: [product('a', 199)], previous: null, buckets: [] })
    const second = mergeShopSnapshot({
      ...base,
      day: 101,
      items: [product('a', 149, { regularPrice: 199 })],
      previous: first.latest as ShopLatestFile,
      buckets: first.buckets,
    })
    const t = second.latest.items[0]
    expect(second.changed).toBe(1)
    expect(t[5]).toBe(149)
    expect(t[12]).toBe(199) // vorheriger Preis
    expect(t[13]).toBe(101) // Tag der Änderung
    expect(t[14]).toBe(149) // Minimum
    expect(t[15]).toBe(199) // Maximum
    expect(t[16]).toBe(100) // zuerst gesehen
    expect(second.buckets[historyBucket('a')]['a']).toEqual([
      [100, 199, 0],
      [101, 149, 1],
    ])
  })

  it('schreibt bei unverändertem Preis keinen neuen Historienpunkt', () => {
    const first = mergeShopSnapshot({ ...base, day: 100, items: [product('a', 199)], previous: null, buckets: [] })
    const second = mergeShopSnapshot({ ...base, day: 105, items: [product('a', 199)], previous: first.latest, buckets: first.buckets })
    expect(second.changed).toBe(0)
    expect(second.buckets[historyBucket('a')]['a']).toHaveLength(1)
    expect(second.removed).toBe(0)
  })

  it('zählt entfallene Produkte', () => {
    const first = mergeShopSnapshot({ ...base, day: 100, items: [product('a', 1), product('b', 2)], previous: null, buckets: [] })
    const second = mergeShopSnapshot({ ...base, day: 101, items: [product('a', 1)], previous: first.latest, buckets: first.buckets })
    expect(second.removed).toBe(1)
    expect(second.latest.items).toHaveLength(1)
  })

  it('kürzt alte Historie, behält aber den letzten Punkt davor', () => {
    const buckets = Array.from({ length: HISTORY_BUCKETS }, () => ({}) as Record<string, [number, number, 0 | 1][]>)
    buckets[0]['x'] = [
      [1, 100, 0],
      [2, 110, 0],
      [800, 120, 0],
    ]
    pruneHistory(buckets, 900, 365)
    expect(buckets[0]['x']).toEqual([
      [2, 110, 0],
      [800, 120, 0],
    ])
  })
})

describe('robots.txt', () => {
  const txt = `
User-agent: AhrefsBot
Disallow: /

User-agent: *
Disallow: /search
Disallow: /*?*template=
Allow: /search/public
`
  const rules = parseRobots(txt)
  it('wendet die *-Gruppe an', () => {
    expect(robotsAllows(rules, '/p/123')).toBe(true)
    expect(robotsAllows(rules, '/search?q=milch')).toBe(false)
    expect(robotsAllows(rules, '/search/public/x')).toBe(true)
    expect(robotsAllows(rules, '/c/foo?a=1&template=2')).toBe(false)
  })
  it('respektiert eine eigene Gruppe für unseren Bot', () => {
    const own = parseRobots('User-agent: GspartVorarlberg\nDisallow: /\n\nUser-agent: *\nDisallow:\n')
    expect(robotsAllows(own, '/irgendwas')).toBe(false)
  })
})
