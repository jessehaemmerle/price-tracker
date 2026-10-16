import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { storeName, TRACKED_STORES } from '../../shared/stores'
import type { StoreId } from '../../shared/types'
import { IconMinus, IconPlus, IconX } from '../components/Icons'
import { Money } from '../components/Price'
import { Empty, Loading } from '../components/States'
import { compareBasket } from '../lib/basket'
import { useProducts, type Product } from '../lib/data'
import { euro, unitPrice } from '../lib/format'
import { useBasket } from './basketState'

const ALL: StoreId[] = TRACKED_STORES.filter((s) => s.category !== 'baumarkt').map((s) => s.id)
const EXAMPLES = ['Vollmilch', 'Butter', 'Toastbrot', 'Bananen', 'Kaffee', 'Zahnpasta']

export default function Basket() {
  const basket = useBasket()
  const [draft, setDraft] = useState('')
  const { products, loaded, loading } = useProducts(ALL)

  const byStore = useMemo(() => {
    const m = new Map<StoreId, Product[]>()
    for (const s of loaded) m.set(s, [])
    for (const p of products) m.get(p.store)?.push(p)
    return m
  }, [products, loaded])

  const { cells, totals } = useMemo(() => compareBasket(basket.items, byStore), [basket.items, byStore])
  const n = basket.items.length
  const best = totals.find((t) => t.found === n && n > 0)

  // Günstigste Mischung über alle Händler – für alle, die mehrere Geschäfte anfahren.
  const mix = useMemo(() => {
    let total = 0
    let found = 0
    basket.items.forEach((it, i) => {
      let cheapest: Product | null = null
      for (const row of cells.values()) {
        const c = row[i]?.chosen
        if (c && (!cheapest || c.price < cheapest.price)) cheapest = c
      }
      if (cheapest) {
        total += cheapest.price * it.qty
        found++
      }
    })
    return { total, found }
  }, [basket.items, cells])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    basket.add(draft)
    setDraft('')
  }

  return (
    <div className="basket">
      <p className="lede">
        Stell deine Einkaufsliste zusammen. Für jeden Händler wird automatisch das günstigste passende Produkt gewählt, nach Grundpreis,
        wenn die Mengen vergleichbar sind. Du kannst die Wahl je Händler ändern.
      </p>
      <form className="basket__add" onSubmit={submit}>
        <label className="field basket__field">
          Artikel hinzufügen
          <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="z. B. Vollmilch 1 l" />
        </label>
        <button type="submit" className="button button--primary" disabled={!draft.trim()}>
          <IconPlus /> Hinzufügen
        </button>
      </form>

      {n === 0 ? (
        <Empty title="Dein Warenkorb ist leer.">
          Füge Artikel hinzu, zum Beispiel:{' '}
          {EXAMPLES.map((ex, i) => (
            <span key={ex}>
              <button type="button" className="link-button" onClick={() => basket.add(ex)}>
                {ex}
              </button>
              {i < EXAMPLES.length - 1 ? ', ' : '.'}
            </span>
          ))}
        </Empty>
      ) : (
        <>
          {loading && <Loading label={`Sortimente werden geladen: ${loaded.length} von ${ALL.length} Händlern …`} />}
          <section className="basket-totals" aria-label="Summen je Händler">
            {totals.map((t) => (
              <div key={t.store} className={`basket-total${best?.store === t.store ? ' basket-total--best' : ''}`}>
                <span className="basket-total__store">{storeName(t.store)}</span>
                <Money cents={t.total} size="1.75rem" />
                <span className="note">
                  {t.found === n ? 'alles gefunden' : `${t.found} von ${n} gefunden`}
                  {best?.store === t.store && ', am günstigsten'}
                </span>
              </div>
            ))}
            {mix.found > 0 && (
              <div className="basket-total basket-total--mix">
                <span className="basket-total__store">Günstigste Mischung</span>
                <Money cents={mix.total} size="1.75rem" />
                <span className="note">jeder Artikel beim billigsten Händler</span>
              </div>
            )}
          </section>

          <div className="table-scroll" tabIndex={0} role="region" aria-label="Warenkorb-Vergleich, seitlich scrollbar">
            <table className="basket-table">
              <caption className="visually-hidden">Warenkorb: gewähltes Produkt und Preis je Händler</caption>
              <thead>
                <tr>
                  <th scope="col">Artikel</th>
                  <th scope="col">Menge</th>
                  {[...cells.keys()].map((s) => (
                    <th key={s} scope="col">
                      {storeName(s)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {basket.items.map((it, i) => {
                  const row = [...cells.entries()].map(([s, list]) => ({ store: s, cell: list[i] }))
                  const prices = row.map((r) => r.cell?.chosen?.price).filter((v): v is number => v !== undefined)
                  const min = prices.length ? Math.min(...prices) : null
                  return (
                    <tr key={it.id}>
                      <th scope="row">
                        <div className="basket-item">
                          <input
                            className="input basket-item__query"
                            aria-label="Suchbegriff des Artikels"
                            value={it.query}
                            onChange={(e) => basket.update(it.id, { query: e.target.value, picks: {} })}
                          />
                          <button type="button" className="icon-button" aria-label={`${it.query} entfernen`} onClick={() => basket.remove(it.id)}>
                            <IconX />
                          </button>
                        </div>
                      </th>
                      <td>
                        <div className="stepper">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Menge verringern"
                            disabled={it.qty <= 1}
                            onClick={() => basket.update(it.id, { qty: Math.max(1, it.qty - 1) })}
                          >
                            <IconMinus />
                          </button>
                          <span className="tabular" aria-live="polite">
                            {it.qty}
                          </span>
                          <button type="button" className="icon-button" aria-label="Menge erhöhen" onClick={() => basket.update(it.id, { qty: it.qty + 1 })}>
                            <IconPlus />
                          </button>
                        </div>
                      </td>
                      {row.map(({ store, cell }) => (
                        <td key={store} className={cell?.chosen && cell.chosen.price === min ? 'basket-cell basket-cell--min' : 'basket-cell'}>
                          {cell?.chosen ? (
                            <>
                              <Money cents={cell.chosen.price * it.qty} size="1.25rem" />
                              {cell.chosen.price === min && <span className="visually-hidden"> (günstigster)</span>}
                              <select
                                className="select basket-cell__pick"
                                aria-label={`Produkt bei ${storeName(store)} für ${it.query}`}
                                value={cell.chosen.id}
                                onChange={(e) => basket.pick(it.id, store, e.target.value)}
                              >
                                {cell.candidates.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} {p.quantity ? `(${p.quantity})` : ''} – {euro(p.price)}
                                  </option>
                                ))}
                              </select>
                              {cell.chosen.unitPrice > 0 && <span className="note">{unitPrice(cell.chosen.unitPrice, cell.chosen.baseUnit)}</span>}
                              <Link className="note" to={`/produkt/${store}/${encodeURIComponent(cell.chosen.id)}`}>
                                Details
                              </Link>
                            </>
                          ) : (
                            <span className="note">{byStore.has(store) ? 'nicht gefunden' : '…'}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="note">
            Online-Preise, im Geschäft kann es abweichen. HOFER, Lidl, PENNY und Müller sind nicht enthalten, weil sie keine abrufbaren
            Preise anbieten.
          </p>
          <button type="button" className="button button--quiet" onClick={basket.clear}>
            Warenkorb leeren
          </button>
        </>
      )}
    </div>
  )
}
