import { useDeferredValue, useMemo, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router'
import { CATEGORY_LABELS, LINKED_STORES, TRACKED_STORES } from '../../shared/stores'
import { dayNumber, type StoreId } from '../../shared/types'
import { IconExternal, IconSearch } from '../components/Icons'
import { ProductRow } from '../components/ProductRow'
import { Empty, ErrorNote, Freshness, Loading } from '../components/States'
import { useProducts, useShopIndex } from '../lib/data'
import { count } from '../lib/format'
import { discount, searchProducts, type SortKey } from '../lib/search'
import { useStoredState } from '../lib/storage'
import { useBasket } from './basketState'
import Basket from './Basket'

const ALL_STORES = TRACKED_STORES.map((s) => s.id)
const SUGGESTIONS = ['Vollmilch', 'Butter', 'Kaffee', 'Bananen', 'Windeln', 'Waschmittel', 'Zahnpasta', 'Akkuschrauber']

export function StoreChips({ selected, onChange }: { selected: StoreId[]; onChange: (s: StoreId[]) => void }) {
  const index = useShopIndex()
  const toggle = (id: StoreId) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  return (
    <div className="chips" role="group" aria-label="Händler">
      {TRACKED_STORES.map((s) => {
        const info = index.data?.stores.find((x) => x.id === s.id)
        return (
          <button key={s.id} type="button" className="chip" aria-pressed={selected.includes(s.id)} onClick={() => toggle(s.id)}>
            {s.name}
            {info && <small>{info.count.toLocaleString('de-AT')}</small>}
          </button>
        )
      })}
    </div>
  )
}

function useStoreSelection() {
  const [stored, setStored] = useStoredState<StoreId[]>('stores', ALL_STORES)
  const selected = stored.filter((s) => ALL_STORES.includes(s))
  return [selected.length ? selected : ALL_STORES, setStored] as const
}

function LoadState({ loaded, total, failed }: { loaded: number; total: number; failed: StoreId[] }) {
  if (loaded + failed.length >= total && !failed.length) return null
  return (
    <p className="note" role="status">
      {loaded < total - failed.length ? `Sortimente werden geladen: ${loaded} von ${total} Händlern …` : ''}
      {failed.length > 0 && ` Nicht verfügbar: ${failed.map((f) => TRACKED_STORES.find((s) => s.id === f)?.name).join(', ')}.`}
    </p>
  )
}

function Search() {
  const [stores, setStores] = useStoreSelection()
  const [query, setQuery] = useStoredState('query', '')
  const [sort, setSort] = useState<SortKey>('relevanz')
  const [limit, setLimit] = useState(60)
  const deferred = useDeferredValue(query)
  const { products, loaded, failed, loading } = useProducts(stores)
  const basket = useBasket()
  const results = useMemo(() => searchProducts(products, deferred, sort, 2000), [products, deferred, sort])

  return (
    <>
      <div className="search-bar">
        <label className="search-input">
          <span className="visually-hidden">Produkt suchen</span>
          <IconSearch />
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(60)
            }}
            placeholder="Produkt, Marke oder Kategorie, z. B. Vollmilch"
            autoComplete="off"
          />
        </label>
        <label className="field">
          Sortieren
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="relevanz">Beste Treffer</option>
            <option value="preis">Preis aufsteigend</option>
            <option value="grundpreis">Grundpreis (€/kg, €/l)</option>
            <option value="rabatt">Höchster Rabatt</option>
          </select>
        </label>
      </div>
      <StoreChips selected={stores} onChange={setStores} />
      <LoadState loaded={loaded.length} total={stores.length} failed={failed} />

      {!deferred.trim() ? (
        <div className="empty">
          <h2 className="empty__title">Was suchst du?</h2>
          <p>Die Suche läuft über alle gewählten Händler gleichzeitig. Ein paar Ideen:</p>
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => setQuery(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : results.length === 0 && !loading ? (
        <Empty title={`Nichts gefunden für „${deferred}“.`}>
          Versuch einen allgemeineren Begriff oder wähle weitere Händler aus. HOFER, Lidl, PENNY und Müller haben keine abrufbaren
          Online-Preise, ihre Angebote findest du unter „Flugblätter“.
        </Empty>
      ) : (
        <>
          <p className="note" aria-live="polite">
            {results.length >= 2000 ? 'Mehr als 2.000 Treffer' : count(results.length, 'Treffer', 'Treffer')}
            {loading ? ', weitere Händler laden noch' : ''}
          </p>
          <ul className="product-list">
            {results.slice(0, limit).map((p) => (
              <ProductRow key={`${p.store}:${p.id}`} product={p} onAddToBasket={basket.addProduct} />
            ))}
          </ul>
          {results.length > limit && (
            <button type="button" className="button more-button" onClick={() => setLimit((l) => l + 60)}>
              Weitere {Math.min(60, results.length - limit)} anzeigen
            </button>
          )}
        </>
      )}
    </>
  )
}

function Deals() {
  const [stores, setStores] = useStoreSelection()
  const [mode, setMode] = useState<'rabatt' | 'gesenkt'>('rabatt')
  const [filter, setFilter] = useState('')
  const [limit, setLimit] = useState(60)
  const { products, loaded, failed } = useProducts(stores)
  const basket = useBasket()
  const deferred = useDeferredValue(filter)

  const list = useMemo(() => {
    const today = dayNumber()
    const base =
      mode === 'rabatt'
        ? products.filter((p) => p.regularPrice > p.price).sort((a, b) => discount(b) - discount(a))
        : products
            .filter((p) => p.previousPrice > p.price && p.changedDay >= today - 7)
            .sort((a, b) => a.price / a.previousPrice - b.price / b.previousPrice)
    return deferred.trim() ? searchProducts(base, deferred, 'rabatt', 5000) : base
  }, [products, mode, deferred])

  return (
    <>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Art">
          <button type="button" aria-pressed={mode === 'rabatt'} onClick={() => setMode('rabatt')}>
            Aktionen mit Rabatt
          </button>
          <button type="button" aria-pressed={mode === 'gesenkt'} onClick={() => setMode('gesenkt')}>
            In den letzten 7 Tagen gesenkt
          </button>
        </div>
        <label className="field">
          In Aktionen suchen
          <input className="input" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="z. B. Kaffee" />
        </label>
      </div>
      <StoreChips selected={stores} onChange={setStores} />
      <LoadState loaded={loaded.length} total={stores.length} failed={failed} />
      <p className="note" aria-live="polite">
        {count(list.length, 'Produkt', 'Produkte')}
      </p>
      {list.length === 0 && loaded.length > 0 ? (
        <Empty level={2} title={mode === 'gesenkt' ? 'Noch keine Preissenkungen erfasst.' : 'Keine Aktionen gefunden.'}>
          {mode === 'gesenkt' ? 'Preissenkungen erscheinen, sobald mindestens zwei Tage Preise aufgezeichnet sind.' : 'Wähle weitere Händler aus.'}
        </Empty>
      ) : (
        <ul className="product-list">
          {list.slice(0, limit).map((p) => (
            <ProductRow key={`${p.store}:${p.id}`} product={p} onAddToBasket={basket.addProduct} showDiscount />
          ))}
        </ul>
      )}
      {list.length > limit && (
        <button type="button" className="button more-button" onClick={() => setLimit((l) => l + 60)}>
          Weitere {Math.min(60, list.length - limit)} anzeigen
        </button>
      )}
    </>
  )
}

function Flyers() {
  const groups = ['lebensmittel', 'drogerie', 'elektronik', 'baumarkt'] as const
  return (
    <>
      <p className="lede">
        Diese Händler blockieren automatische Preisabfragen oder haben keinen Online-Shop. Ihre aktuellen Angebote findest du direkt beim
        Händler.
      </p>
      {groups.map((g) => (
        <section key={g} className="flyer-group" aria-labelledby={`fly-${g}`}>
          <h2 id={`fly-${g}`}>{CATEGORY_LABELS[g]}</h2>
          <ul className="flyer-list">
            {LINKED_STORES.filter((s) => s.category === g).map((s) => (
              <li key={s.name}>
                <a href={s.url} target="_blank" rel="noreferrer" className="flyer-link">
                  <span className="flyer-link__name">{s.name}</span>
                  <span className="flyer-link__note">{s.note}</span>
                  <IconExternal className="flyer-link__icon" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

export default function Shops() {
  const index = useShopIndex()
  const basket = useBasket()
  const stale = index.data?.stores.filter((s) => s.stale) ?? []
  return (
    <div className="page">
      <header className="view-head">
        <h1>Einkaufen</h1>
        <p>
          Online-Preise von {TRACKED_STORES.map((s) => s.name).join(', ')}. Täglich aktualisiert, mit Verlauf jedes Produkts. Bei OBI wird
          eine Auswahl über Sortiments-Suchbegriffe erfasst.
        </p>
        <Freshness iso={index.data?.updatedAt} />
      </header>
      {index.error && <ErrorNote error={index.error} what="Händlerpreise" />}
      {stale.length > 0 && (
        <p className="notice">
          Letzte Aktualisierung fehlgeschlagen bei {stale.map((s) => s.name).join(', ')}. Es werden die Preise vom letzten erfolgreichen
          Lauf angezeigt.
        </p>
      )}
      <nav className="tabs" aria-label="Bereiche">
        <NavLink to="/einkaufen" end>
          Suche
        </NavLink>
        <NavLink to="/einkaufen/aktionen">Aktionen</NavLink>
        <NavLink to="/einkaufen/warenkorb">
          Warenkorb-Vergleich{basket.items.length ? ` (${basket.items.length})` : ''}
        </NavLink>
        <NavLink to="/einkaufen/flugblaetter">Flugblätter</NavLink>
      </nav>
      {index.loading ? (
        <Loading />
      ) : (
        <Routes>
          <Route index element={<Search />} />
          <Route path="aktionen" element={<Deals />} />
          <Route path="warenkorb" element={<Basket />} />
          <Route path="flugblaetter" element={<Flyers />} />
        </Routes>
      )}
    </div>
  )
}
