import { describe, expect, it } from 'vitest'
import { parseEuroCents, parseQuantity, parseUnitPriceString, toNumber, unitPriceCents } from '../shared/units'

describe('toNumber', () => {
  it('liest deutsche und englische Schreibweise', () => {
    expect(toNumber('1,5')).toBe(1.5)
    expect(toNumber('1.5')).toBe(1.5)
    expect(toNumber('1.000')).toBe(1000)
    expect(toNumber('1.234,56')).toBe(1234.56)
  })
})

describe('parseQuantity', () => {
  it('erkennt einfache Mengen', () => {
    expect(parseQuantity('Bio-Karotten 400g')).toEqual({ amount: 0.4, unit: 'kg' })
    expect(parseQuantity('Vollmilch 1 l')).toEqual({ amount: 1, unit: 'l' })
    expect(parseQuantity('Shampoo, 250 ml')).toEqual({ amount: 0.25, unit: 'l' })
    expect(parseQuantity('Waschmittel 20 WL')).toEqual({ amount: 20, unit: 'WL' })
  })
  it('rechnet Multipacks zusammen', () => {
    expect(parseQuantity('Mineralwasser 6 x 1,5 l')).toEqual({ amount: 9, unit: 'l' })
  })
  it('liefert null ohne Menge', () => {
    expect(parseQuantity('Akkuschrauber Profi')).toBeNull()
  })
})

describe('parseUnitPriceString', () => {
  it('liest die Formate der Händler', () => {
    expect(parseUnitPriceString('4.03 €/kg')).toEqual({ cents: 403, unit: 'kg' })
    expect(parseUnitPriceString('3,50 € je 1 kg')).toEqual({ cents: 350, unit: 'kg' })
    expect(parseUnitPriceString('0,38 € je 100 ml')).toEqual({ cents: 380, unit: 'l' })
    expect(parseUnitPriceString('0,50 € /Stk')).toEqual({ cents: 50, unit: 'Stk' })
    expect(parseUnitPriceString('100 ml 10,65')).toEqual({ cents: 10650, unit: 'l' })
    expect(parseUnitPriceString('')).toBeNull()
  })
})

describe('parseEuroCents', () => {
  it('liest Preise robust', () => {
    expect(parseEuroCents('1,99 €')).toBe(199)
    expect(parseEuroCents('0,35 €')).toBe(35)
    expect(parseEuroCents(2.85)).toBe(285)
    expect(parseEuroCents('1.234,50 €')).toBe(123450)
    expect(parseEuroCents('99,99')).toBe(9999)
    expect(Number.isNaN(parseEuroCents(''))).toBe(true)
    expect(Number.isNaN(parseEuroCents(null))).toBe(true)
  })
})

describe('unitPriceCents', () => {
  it('rechnet auf die Basiseinheit um', () => {
    expect(unitPriceCents(161, { amount: 0.4, unit: 'kg' })).toBe(403)
    expect(unitPriceCents(100, null)).toBe(0)
  })
})
