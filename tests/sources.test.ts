import { describe, expect, it } from 'vitest'
import { mapBillaProduct, type BillaProduct } from '../scraper/sources/billa'
import { extractBipaResult, mapBipaHit, slugify } from '../scraper/sources/bipa'
import { mapDmProduct, type DmProduct } from '../scraper/sources/dm'
import { mapRatedProduct, parseHeatingOil, parsePelletIndex, type RatedProduct } from '../scraper/sources/energy'
import { queryPoints } from '../scraper/sources/fuel'
import { decodeEntities, extractLdProducts, mapLdProduct } from '../scraper/sources/jsonld'
import { mapSparHit } from '../scraper/sources/spar'

describe('SPAR', () => {
  it('bildet einen Treffer ab', () => {
    const p = mapSparHit({
      masterValues: {
        'product-number': '2020003743085',
        'short-description': 'Bio-Karotten gelb',
        'short-description-3': '400 G',
        price: 1.61,
        'regular-price': 1.99,
        'price-per-unit': '4.03 €/kg',
        brand: ['SPAR Natur*pur'],
        categories: ['F1-1_Frischgemüse:F1-1-4_Wurzelgemüse', 'root_Produkte:F1_Obst & Gemüse'],
        url: '/spar-naturpur-bio-karotten-gelb/p/2020003743085',
        'image-url': 'https://cdn1.interspar.at/x.jpg',
      },
    })!
    expect(p).toMatchObject({ id: '2020003743085', price: 161, regularPrice: 199, unitPrice: 403, baseUnit: 'kg', category: 'Obst & Gemüse', promo: 'Aktion' })
    expect(p.url).toBe('https://www.interspar.at/shop/lebensmittel/spar-naturpur-bio-karotten-gelb/p/2020003743085')
  })
})

describe('BILLA', () => {
  const base: BillaProduct = {
    sku: '00-965624',
    name: 'Milka Erdnuss Crisp',
    slug: 'milka-erdnuss-crisp-00965624',
    amount: '90',
    volumeLabelShort: 'g',
    brand: { name: 'Milka' },
    images: ['https://images.cdn.europe-west1.gcp.commercetools.com/a.jpg'],
    inPromotion: true,
    price: {
      baseUnitShort: 'g',
      basePriceFactor: '100',
      crossed: 199,
      regular: { value: 132, perStandardizedQuantity: 147, promotionQuantity: 6, promotionText: 'Bei 6 Tafeln je' },
      standard: { value: 199, perStandardizedQuantity: 221 },
    },
  }
  it('nimmt bei Mengenaktionen den Einzelpreis', () => {
    const p = mapBillaProduct(base)!
    expect(p.price).toBe(199)
    expect(p.regularPrice).toBe(0)
    expect(p.promo).toBe('Bei 6 Tafeln je 1,32 €')
    expect(p.unitPrice).toBe(2210) // 2,21 € je 100 g → 22,10 €/kg
    expect(p.baseUnit).toBe('kg')
  })
  it('übernimmt einfache Aktionen mit Streichpreis', () => {
    const p = mapBillaProduct({ ...base, price: { ...base.price, regular: { value: 149, perStandardizedQuantity: 166 }, crossed: 199 } })!
    expect(p.price).toBe(149)
    expect(p.regularPrice).toBe(199)
    expect(p.promo).toBe('Aktion')
  })
})

describe('dm', () => {
  it('liest Preis, Vorpreis und Grundpreis', () => {
    const p = mapDmProduct({
      dan: 1,
      title: 'Shampoo Ultra Sensitiv, 250 ml',
      brandName: 'Balea med',
      tileData: {
        self: '/p/d/1/balea',
        price: { price: { current: { value: '0,95 €' }, previous: { value: '1,55 €' } }, tileInfos: ['250 ml (0,38 € je 100 ml)'] },
        trackingData: { categories: ['Shampoo'] },
      },
    } satisfies DmProduct)!
    expect(p).toMatchObject({ id: '1', price: 95, regularPrice: 155, unitPrice: 380, baseUnit: 'l', quantity: '250 ml', category: 'Shampoo', promo: 'Aktion' })
  })
})

describe('BIPA', () => {
  it('findet das eingebettete Suchergebnis', () => {
    const html = `<html><script id="mobify-data" type="application/json">${JSON.stringify({
      __PRELOADED_STATE__: { q: [{ state: { data: { productSearchResult: { total: 2, offset: 0, hits: [{ productId: 'B3-1', productName: 'X' }] } } } }] },
    })}</script></html>`
    expect(extractBipaResult(html)?.total).toBe(2)
  })
  it('bildet einen Treffer ab', () => {
    const p = mapBipaHit({
      productId: 'B3-408257',
      productName: 'meridol Zahnpasta Parodont Expert',
      c_brand: 'meridol',
      c_category: 'mund-zahnpflege-zahnpasta',
      c_inhalt: '75 ml',
      c_displayedPrice: 7.99,
      c_insteadPrice: '9.99',
      c_basePrice: '100 ml 10,65',
    })!
    expect(p).toMatchObject({ price: 799, regularPrice: 999, unitPrice: 10650, baseUnit: 'l', category: 'Mund', promo: 'Aktion' })
    expect(p.url).toBe('https://www.bipa.at/p/meridol-zahnpasta-parodont-expert/B3-408257')
  })
  it('erzeugt URL-Slugs mit Umlauten', () => {
    expect(slugify('Kräuter Zahncreme für Groß & Klein')).toBe('kraeuter-zahncreme-fuer-gross-klein')
  })
})

describe('JSON-LD (Müller, OBI)', () => {
  const html = `<script type="application/ld+json">{"@type":"ItemList","numberOfItems":240,"itemListElement":[
    {"@type":"ListItem","position":1,"item":{"@type":"Product","name":"Vademecum Zahnpasta Salbei &amp; Minze 75 ml","url":"https://www.mueller.at/p/vademecum-349246/","image":["https://static.prod.ecom.mueller.de/a.jpg"],"offers":{"price":2.35}}},
    {"@type":"ListItem","position":2,"item":{"@type":"Product","name":"Bosch Bohrer","url":"/p/4431300/bosch","sku":"4431300","brand":"Bosch","category":"Bohrmaschinen","offers":{"price":"99.99"}}}
  ]}</script>`
  it('liest Produkte und Gesamtzahl', () => {
    const { products, numberOfItems } = extractLdProducts(html)
    expect(numberOfItems).toBe(240)
    expect(products).toHaveLength(2)
    const m = mapLdProduct(products[0], 'https://www.mueller.at', (u) => u.replace(/\/$/, '').split('-').pop()!)!
    expect(m).toMatchObject({ id: '349246', name: 'Vademecum Zahnpasta Salbei & Minze 75 ml', price: 235, unitPrice: 3133, baseUnit: 'l' })
    const o = mapLdProduct(products[1], 'https://www.obi.at', () => 'x')!
    expect(o).toMatchObject({ id: '4431300', price: 9999, brand: 'Bosch', url: 'https://www.obi.at/p/4431300/bosch' })
  })
  it('dekodiert HTML-Entitäten', () => {
    expect(decodeEntities('Jean&amp;Len &#252; &#x2013;')).toBe('Jean&Len ü –')
  })
})

describe('Energie', () => {
  it('liest den Heizölpreis aus dem Seitentext', () => {
    const html = '<div><span>100l</span> <span>16.10.26</span> <b>182,70</b> <span>€</span></div>'
    expect(parseHeatingOil(html)).toEqual({ day: 20742, price: 182.7 })
    expect(parseHeatingOil('<p>kein Preis</p>')).toBeNull()
  })
  it('liest den Pelletpreisindex aus der Tabelle', () => {
    const cells = new Map<string, string | number>([
      ['B3', 'Jahr'],
      ['C3', 2025],
      ['D3', 2026],
      ['B5', 'Jän'],
      ['C5', 220.5],
      ['D5', 240.1],
      ['B6', 'Feb'],
      ['C6', 221],
    ])
    expect(parsePelletIndex(cells)).toEqual([
      ['2025-01', 220.5],
      ['2025-02', 221],
      ['2026-01', 240.1],
    ])
  })
  it('rechnet Tarife in Euro und Cent um', () => {
    const t = mapRatedProduct(
      {
        brandName: 'vkw ',
        productName: 'Strom Duo',
        annualGrossRate: 87207.9,
        calculatedProductEnergyCosts: { energyRateTotal: 42700, baseRate: 3600, totalGrossSum: 50179.4, taxRate: 0.2 },
        contractTermInfo: { priceGuaranteeType: 'NO_GUARANTEE', priceGuaranteeMonths: null },
      },
      3500,
    )!
    expect(t).toEqual({
      brand: 'vkw',
      product: 'Strom Duo',
      annualTotal: 872.08,
      annualEnergy: 501.79,
      energyCt: 14.64,
      baseFee: 43.2,
      guaranteeMonths: null,
      dynamic: false,
    })
    expect(mapRatedProduct({ annualGrossRate: 0 } as unknown as RatedProduct, 3500)).toBeNull()
  })
})

describe('Sprit', () => {
  it('bildet je Postleitzahl einen Abfragepunkt', () => {
    const s = (id: number, plz: string, lat: number, lon: number) => ({ id, name: '', address: '', city: '', district: '', postalCode: plz, lat, lon })
    const pts = queryPoints([s(1, '6850', 47.4, 9.7), s(2, '6850', 47.42, 9.74), s(3, '6900', 47.5, 9.75)])
    expect(pts).toHaveLength(2)
    expect(pts[0].lat).toBeCloseTo(47.41)
    expect(pts[0].lon).toBeCloseTo(9.72)
  })
})
