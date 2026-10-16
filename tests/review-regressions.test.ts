import { describe, expect, it } from 'vitest'
import { HISTORY_BUCKETS, type PricePoint } from '../shared/types'
import { pruneHistory } from '../scraper/lib/shopHistory'
import { validateProducts } from '../scraper/lib/validate'
import { decodeEntities, mapLdProduct } from '../scraper/sources/jsonld'
import { readStored, writeStored } from '../src/lib/storage'

describe('Regressionen aus dem Code-Review', () => {
  it('Speicher funktioniert auch ohne localStorage (privates Fenster)', () => {
    // In der Test-Umgebung gibt es kein window.localStorage – wie bei gesperrten Website-Daten.
    expect(readStored('test-list', [] as number[])).toEqual([])
    writeStored('test-list', [1])
    writeStored('test-list', [...readStored('test-list', [] as number[]), 2])
    expect(readStored('test-list', [] as number[])).toEqual([1, 2])
  })

  it('ungültige numerische Entitäten werfen nicht', () => {
    expect(decodeEntities('A &#99999999; B')).toBe('A &#99999999; B')
  })

  it('numerische SKU wird zur Zeichenkette', () => {
    const p = mapLdProduct({ '@type': 'Product', name: 'Schraube', url: '/p/1/x', sku: 1234567, offers: { price: '1.99' } }, 'https://www.obi.at', () => 'fallback')
    expect(p?.id).toBe('1234567')
  })

  it('IDs, die sich nur durch Leerzeichen unterscheiden, sind Duplikate', () => {
    const { items, report } = validateProducts(
      [
        { id: '123', name: 'A', price: 100 },
        { id: '123 ', name: 'A', price: 100 },
      ],
      { minCount: 1 },
    )
    expect(items).toHaveLength(1)
    expect(report.duplicates).toBe(1)
  })

  it('kürzt Historie auch, wenn alle Punkte älter als die Frist sind', () => {
    const buckets = Array.from({ length: HISTORY_BUCKETS }, () => ({}) as Record<string, PricePoint[]>)
    buckets[3]['alt'] = [
      [1, 100, 0],
      [2, 90, 1],
      [3, 95, 0],
    ]
    pruneHistory(buckets, 2000, 730)
    expect(buckets[3]['alt']).toEqual([[3, 95, 0]])
  })
})
