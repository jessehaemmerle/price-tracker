import { describe, expect, it } from 'vitest'
import { evaluateRule, shouldNotify, type AlertData } from '../scraper/alerts'
import { compareBasket, matchItem, newBasketItem } from '../src/lib/basket'
import { normalize, toProduct, type Product } from '../src/lib/data'
import { fuelParts } from '../src/lib/format'
import { distanceKm, hourlyPattern, openNow } from '../src/lib/fuel'
import { searchProducts } from '../src/lib/search'
import type { ProductTuple, StoreId } from '../shared/types'

const tuple = (id: string, name: string, price: number, unitPrice = 0, baseUnit = ''): ProductTuple => [
  id, name, '', '', '', price, 0, unitPrice, baseUnit, '', '', '', 0, 1, price, price, 1,
]
const prod = (store: StoreId, id: string, name: string, price: number, unitPrice = 0, baseUnit = ''): Product =>
  toProduct({ store, urlPrefix: '', imagePrefix: '' }, tuple(id, name, price, unitPrice, baseUnit))

describe('Suche', () => {
  const list = [
    prod('spar', '1', 'SPAR Vollmilch 3,5 % 1 l', 129, 129, 'l'),
    prod('billa', '2', 'Clever Vollmilch', 119, 119, 'l'),
    prod('spar', '3', 'Milchschokolade Vollmilch Riegel', 99, 1980, 'kg'),
    prod('dm', '4', 'Zahnpasta Kräuter', 195),
  ]
  it('normalisiert Umlaute', () => {
    expect(normalize('Kräuter-Öl Größe')).toBe('kraeuter oel groesse')
  })
  it('findet alle Wörter und sortiert nach Relevanz', () => {
    const r = searchProducts(list, 'vollmilch')
    expect(r.map((p) => p.id)).toEqual(['2', '1', '3'])
    expect(searchProducts(list, 'kraeuter zahn').map((p) => p.id)).toEqual(['4'])
    expect(searchProducts(list, 'kräuter').map((p) => p.id)).toEqual(['4'])
  })
  it('sortiert nach Grundpreis', () => {
    expect(searchProducts(list, 'vollmilch', 'grundpreis').map((p) => p.id)).toEqual(['2', '1', '3'])
  })
})

describe('Warenkorb', () => {
  it('wählt pro Händler das günstigste passende Produkt nach Grundpreis', () => {
    const spar = [prod('spar', 'a', 'Vollmilch 1 l', 129, 129, 'l'), prod('spar', 'b', 'Vollmilch 0,5 l', 79, 158, 'l')]
    const cell = matchItem(newBasketItem('Vollmilch'), spar, 'spar')
    expect(cell.chosen?.id).toBe('a')
  })
  it('respektiert die eigene Wahl und summiert Mengen', () => {
    const item = { ...newBasketItem('Vollmilch'), qty: 2, picks: { spar: 'b' } }
    const byStore = new Map<StoreId, Product[]>([
      ['spar', [prod('spar', 'a', 'Vollmilch 1 l', 129, 129, 'l'), prod('spar', 'b', 'Vollmilch 0,5 l', 79, 158, 'l')]],
      ['billa', [prod('billa', 'c', 'Clever Vollmilch', 119, 119, 'l')]],
      ['dm', []],
    ])
    const { totals } = compareBasket([item], byStore)
    expect(totals[0]).toEqual({ store: 'spar', total: 158, found: 1 })
    expect(totals.find((t) => t.store === 'billa')?.total).toBe(238)
    expect(totals.find((t) => t.store === 'dm')?.found).toBe(0)
  })
})

describe('Sprit-Helfer', () => {
  it('zerlegt Preise wie auf der Preistafel', () => {
    expect(fuelParts(1.589)).toEqual(['1,58', '9'])
    expect(fuelParts(2.1)).toEqual(['2,10', '0'])
  })
  it('berechnet Entfernungen', () => {
    expect(distanceKm({ lat: 47.413, lon: 9.744 }, { lat: 47.503, lon: 9.747 })).toBeCloseTo(10, 0)
  })
  it('prüft Öffnungszeiten in Wiener Zeit', () => {
    const st = { id: 1, name: '', address: '', postalCode: '', city: '', district: '', lat: 0, lon: 0, hours: { FR: '06:00-22:00' } }
    expect(openNow(st, new Date('2026-10-16T08:00:00Z'))).toBe(true) // Fr 10:00
    expect(openNow(st, new Date('2026-10-16T21:30:00Z'))).toBe(false) // Fr 23:30
    expect(openNow({ ...st, hours: undefined })).toBeNull()
  })
  it('ermittelt das Tagesmuster nur aus vollständigen Tagen', () => {
    const points: [number, number][] = []
    for (let h = 0; h < 24; h++) points.push([Date.UTC(2026, 9, 14, h), h === 12 ? 1.7 : 1.6])
    for (let h = 0; h < 5; h++) points.push([Date.UTC(2026, 9, 15, h), 1.6])
    const r = hourlyPattern(points, (t) => new Date(t).getUTCHours(), (t) => new Date(t).toISOString().slice(0, 10))
    expect(r.days).toBe(1)
    expect(r.deviations[12]!).toBeGreaterThan(9)
    expect(r.deviations[3]!).toBeLessThan(0)
  })
})

describe('Push-Alarme', () => {
  const data: AlertData = {
    stations: {
      updatedAt: '',
      stations: [
        { id: 1, name: 'A', address: '', postalCode: '6850', city: 'Dornbirn', district: 'Dornbirn', lat: 0, lon: 0 },
        { id: 2, name: 'B', address: '', postalCode: '6700', city: 'Bludenz', district: 'Bludenz', lat: 0, lon: 0 },
      ],
    },
    fuel: { updatedAt: '', prices: { '1': { DIE: 1.55 }, '2': { DIE: 1.49 } }, open: {} },
    spot: { updatedAt: '', hours: [[Date.UTC(2026, 9, 16, 12) / 1000, 2.5]] },
    heatingOil: { updatedAt: '', unit: '', source: '', sourceUrl: '', series: [[1, 99]] },
    shop: async () => null,
    now: new Date(Date.UTC(2026, 9, 16, 10)),
  }
  it('löst bei Unterschreiten der Schwelle aus und filtert nach Bezirk', async () => {
    expect((await evaluateRule({ id: 'a', type: 'fuel', fuel: 'DIE', below: 1.5 }, data))?.value).toBe(1.49)
    expect(await evaluateRule({ id: 'b', type: 'fuel', fuel: 'DIE', below: 1.5, districts: ['Dornbirn'] }, data)).toBeNull()
    expect((await evaluateRule({ id: 'c', type: 'spot', belowCt: 3 }, data))?.value).toBe(2.5)
    expect(await evaluateRule({ id: 'd', type: 'heatingoil', below: 90 }, data)).toBeNull()
  })
  it('meldet erneut nur bei weiterem Fallen oder nach 24 Stunden', () => {
    const now = new Date('2026-10-16T12:00:00Z')
    expect(shouldNotify(undefined, 1.5, now)).toBe(true)
    expect(shouldNotify({ value: 1.5, at: '2026-10-16T10:00:00Z' }, 1.5, now)).toBe(false)
    expect(shouldNotify({ value: 1.5, at: '2026-10-16T10:00:00Z' }, 1.49, now)).toBe(true)
    expect(shouldNotify({ value: 1.5, at: '2026-10-15T10:00:00Z' }, 1.5, now)).toBe(true)
  })
})
