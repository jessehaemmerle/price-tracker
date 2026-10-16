import { Link } from 'react-router'
import { storeName } from '../../shared/stores'
import { dayNumber } from '../../shared/types'
import { productKey, type Product } from '../lib/data'
import { euro, unitPrice } from '../lib/format'
import { discount } from '../lib/search'
import { useWatchlist } from '../lib/watchlist'
import { IconPlus, IconStar } from './Icons'
import { Delta, Money } from './Price'

export function WatchProductButton({ product }: { product: Product }) {
  const { has, toggle } = useWatchlist()
  const watched = has(`product:${productKey(product)}`)
  return (
    <button
      type="button"
      className="icon-button"
      aria-pressed={watched}
      aria-label={watched ? `${product.name} von der Merkliste entfernen` : `${product.name} auf die Merkliste`}
      title={watched ? 'Auf der Merkliste' : 'Merken'}
      onClick={() =>
        toggle({
          kind: 'product',
          store: product.store,
          id: product.id,
          name: product.name,
          addedPrice: product.price,
          addedAt: new Date().toISOString(),
        })
      }
    >
      <IconStar filled={watched} />
    </button>
  )
}

export function ProductRow({
  product,
  onAddToBasket,
  showDiscount,
}: {
  product: Product
  onAddToBasket?: (p: Product) => void
  showDiscount?: boolean
}) {
  const p = product
  const recent = p.previousPrice && p.changedDay >= dayNumber() - 7
  const off = discount(p)
  return (
    <li className="product-row">
      <div className="product-row__media" aria-hidden="true">
        {p.image ? <img src={p.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : null}
      </div>
      <div className="product-row__body">
        <Link to={`/produkt/${p.store}/${encodeURIComponent(p.id)}`} className="product-row__name">
          {p.name}
        </Link>
        <div className="product-row__meta">
          <span className="store-tag">{storeName(p.store)}</span>
          {p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) && <span>{p.brand}</span>}
          {p.quantity && <span>{p.quantity}</span>}
          {p.promo && <span className="promo">{p.promo}</span>}
        </div>
      </div>
      <div className="product-row__price">
        <Money cents={p.price} size="1.5rem" />
        {p.regularPrice > p.price && (
          <span className="product-row__was">
            <span className="visually-hidden">statt </span>
            <s>{euro(p.regularPrice)}</s>
            {showDiscount && off >= 1 && <span className="product-row__off"> −{Math.round(off)} %</span>}
          </span>
        )}
        {p.unitPrice > 0 && <span className="product-row__unit">{unitPrice(p.unitPrice, p.baseUnit)}</span>}
        {recent ? <Delta diff={p.price - p.previousPrice} format={euro} /> : null}
      </div>
      <div className="product-row__actions">
        <WatchProductButton product={p} />
        {onAddToBasket && (
          <button
            type="button"
            className="icon-button"
            aria-label={`${p.name} in den Warenkorb-Vergleich`}
            title="In den Warenkorb-Vergleich"
            onClick={() => onAddToBasket(p)}
          >
            <IconPlus />
          </button>
        )}
      </div>
    </li>
  )
}
