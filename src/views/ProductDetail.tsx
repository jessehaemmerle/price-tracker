import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { storeName, TRACKED_STORES } from '../../shared/stores'
import { dayToDate, type PricePoint, type StoreId } from '../../shared/types'
import { LineChart } from '../components/charts/LineChart'
import { IconExternal, IconPlus } from '../components/Icons'
import { ProductRow, WatchProductButton } from '../components/ProductRow'
import { Money } from '../components/Price'
import { Empty, Loading } from '../components/States'
import { loadProductHistory, useProducts } from '../lib/data'
import { euro, longDate, shortDate, unitPrice } from '../lib/format'
import { discount, similarProducts } from '../lib/search'
import { useBasket } from './basketState'

const ALL = TRACKED_STORES.map((s) => s.id)

export default function ProductDetail() {
  const { store, id } = useParams() as { store: StoreId; id: string }
  const productId = decodeURIComponent(id)
  const own = useProducts(useMemo(() => [store], [store]))
  const product = own.products.find((p) => p.id === productId)
  const [history, setHistory] = useState<PricePoint[] | null>(null)
  const [compare, setCompare] = useState(false)
  const others = useProducts(compare ? ALL : [])
  const basket = useBasket()
  const [added, setAdded] = useState(false)

  useEffect(() => {
    let alive = true
    setHistory(null)
    loadProductHistory(store, productId).then(
      (h) => alive && setHistory(h),
      () => alive && setHistory([]),
    )
    return () => {
      alive = false
    }
  }, [store, productId])

  const similar = useMemo(() => (product && compare ? similarProducts(product, others.products) : []), [product, compare, others.products])

  if (own.loading) return <div className="page"><Loading /></div>
  if (!product) {
    return (
      <div className="page">
        <Empty level={1} title="Dieses Produkt ist derzeit nicht im Online-Sortiment." action={<Link to="/einkaufen">Zur Produktsuche</Link>}>
          Es wurde vielleicht ausgelistet oder ist vorübergehend nicht verfügbar.
        </Empty>
      </div>
    )
  }

  const series = history?.length
    ? [
        {
          id: 'preis',
          label: 'Preis',
          color: 'var(--series-die)',
          points: history.map((p) => [dayToDate(p[0]).getTime(), p[1] / 100] as [number, number]),
        },
      ]
    : []
  const promoDays = history?.filter((p) => p[2] === 1).length ?? 0
  const off = discount(product)

  return (
    <div className="page">
      <nav className="crumbs" aria-label="Brotkrümel">
        <Link to="/einkaufen">Einkaufen</Link> <span aria-hidden="true">/</span> <span>{storeName(store)}</span>
        {product.category && (
          <>
            {' '}
            <span aria-hidden="true">/</span> <span>{product.category}</span>
          </>
        )}
      </nav>
      <div className="product-hero">
        <div className="product-hero__media">
          {product.image ? <img src={product.image} alt={product.name} referrerPolicy="no-referrer" /> : null}
        </div>
        <div className="product-hero__body">
          <span className="store-tag">{storeName(store)}</span>
          <h1>{product.name}</h1>
          <p className="note">{[product.brand, product.quantity].filter(Boolean).join(', ')}</p>
          <div className="product-hero__price">
            <Money cents={product.price} size="3.5rem" />
            {product.regularPrice > product.price && (
              <span className="product-row__was">
                statt <s>{euro(product.regularPrice)}</s> {off >= 1 && <strong>−{Math.round(off)} %</strong>}
              </span>
            )}
          </div>
          {product.unitPrice > 0 && <p>Grundpreis {unitPrice(product.unitPrice, product.baseUnit)}</p>}
          {product.promo && <p className="promo">{product.promo}</p>}
          <dl className="facts">
            <div>
              <dt>Tiefster Preis seit Beginn der Aufzeichnung</dt>
              <dd>{euro(product.minPrice)}</dd>
            </div>
            <div>
              <dt>Höchster Preis</dt>
              <dd>{euro(product.maxPrice)}</dd>
            </div>
            <div>
              <dt>Erfasst seit</dt>
              <dd>{longDate(dayToDate(product.firstSeenDay))}</dd>
            </div>
            {product.previousPrice > 0 && (
              <div>
                <dt>Letzte Änderung</dt>
                <dd>
                  {shortDate(dayToDate(product.changedDay))}, vorher {euro(product.previousPrice)}
                </dd>
              </div>
            )}
          </dl>
          <div className="product-hero__actions">
            <WatchProductButton product={product} />
            <button
              type="button"
              className="button"
              onClick={() => {
                basket.addProduct(product)
                setAdded(true)
              }}
            >
              <IconPlus /> {added ? 'Im Warenkorb-Vergleich' : 'In den Warenkorb-Vergleich'}
            </button>
            {product.url && (
              <a className="button button--quiet" href={product.url} target="_blank" rel="noreferrer">
                <IconExternal /> Beim Händler ansehen
              </a>
            )}
          </div>
        </div>
      </div>

      <section className="section" aria-labelledby="p-history">
        <div className="section__head">
          <h2 id="p-history">Preisverlauf</h2>
          {promoDays > 0 && <p>Davon {promoDays} Preisänderungen im Rahmen von Aktionen.</p>}
        </div>
        {history === null ? (
          <Loading />
        ) : series.length && history.length > 0 ? (
          <LineChart
            series={series}
            title={`Preisverlauf ${product.name} bei ${storeName(store)} in Euro`}
            yFormat={(v) => euro(Math.round(v * 100))}
            xFormat={(t) => longDate(t)}
            step
            xMax={Date.now()}
            area
            height={220}
          />
        ) : (
          <p className="note">Noch kein Verlauf vorhanden.</p>
        )}
        {history && history.length === 1 && (
          <p className="note">Bisher eine Messung. Jede Preisänderung ab jetzt erscheint als neue Stufe.</p>
        )}
      </section>

      <section className="section" aria-labelledby="p-similar">
        <div className="section__head">
          <h2 id="p-similar">Bei anderen Händlern</h2>
          <p>Ähnliche Produkte nach Name und Marke, sortiert nach Grundpreis.</p>
        </div>
        {!compare ? (
          <button type="button" className="button" onClick={() => setCompare(true)}>
            Vergleichen
          </button>
        ) : others.loading && !similar.length ? (
          <Loading label="Sortimente werden geladen …" />
        ) : similar.length ? (
          <ul className="product-list">
            {similar.map((p) => (
              <ProductRow key={`${p.store}:${p.id}`} product={p} />
            ))}
          </ul>
        ) : (
          <p className="note">Kein vergleichbares Produkt gefunden.</p>
        )}
      </section>
    </div>
  )
}
