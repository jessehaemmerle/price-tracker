import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Link } from 'react-router'
import type { FuelStation } from '../../shared/types'
import { decimal } from '../lib/format'

export interface MapStation {
  station: FuelStation
  price: number | null
}

const RAMP = ['--pin-0', '--pin-1', '--pin-2', '--pin-3', '--pin-4']
const LABELLED = 12

/**
 * Die günstigsten Tankstellen als Preis-Schild (Preis als Text), alle übrigen
 * als Punkt in der Farbe ihrer Ersparnisstufe (dunkler = günstiger).
 */
function priceIcon(price: number | null, step: number, selected: boolean, label: boolean): L.DivIcon {
  if (price === null) {
    // 24 px Trefferfläche (WCAG 2.5.8), sichtbar ist nur der kleine Ring in der Mitte
    return L.divIcon({ className: 'map-pin map-pin--none', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] })
  }
  if (!label) {
    return L.divIcon({
      className: 'map-pin map-pin--dot',
      html: `<span style="background:var(${RAMP[step]})"></span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
  }
  return L.divIcon({
    className: `map-pin${selected ? ' map-pin--selected' : ''}`,
    html: `<span style="background:var(--pin-${step});color:var(--pin-ink-${step})">${decimal(price, 3)}</span>`,
    iconSize: [54, 24],
    iconAnchor: [27, 12],
  })
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  const key = points.length
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 13 })
    // nur beim ersten Laden bzw. wenn sich die Anzahl ändert
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

export default function FuelMap({
  items,
  unit,
  selectedId,
  dark,
}: {
  items: MapStation[]
  unit: string
  selectedId?: number | null
  dark: boolean
}) {
  const priced = items.filter((i) => i.price !== null).map((i) => i.price as number)
  const min = Math.min(...priced)
  const max = Math.max(...priced)
  const step = (p: number) => (max === min ? 4 : Math.min(4, Math.floor(((max - p) / (max - min)) * 5)))
  const points = useMemo(() => items.map((i) => [i.station.lat, i.station.lon] as [number, number]), [items])
  const labelled = useMemo(
    () => new Set([...priced].sort((a, b) => a - b).slice(0, LABELLED)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  )
  const cutoff = Math.max(...labelled)

  return (
    <div className={`fuel-map${dark ? ' fuel-map--dark' : ''}`}>
      <MapContainer center={[47.25, 9.88]} zoom={9} scrollWheelZoom={false} className="fuel-map__map" aria-label="Karte der Tankstellen">
        {/* Offizielle Grundkarte der österreichischen Länder, frei nutzbar (CC BY 4.0). */}
        <TileLayer
          url="https://mapsneu.wien.gv.at/basemap/bmapgrau/normal/google3857/{z}/{y}/{x}.png"
          attribution='Grundkarte: <a href="https://basemap.at">basemap.at</a>'
          maxZoom={19}
        />
        <FitBounds points={points} />
        {[...items]
          .sort((a, b) => (b.price ?? 99) - (a.price ?? 99))
          .map(({ station, price }) => (
            <Marker
              key={station.id}
              position={[station.lat, station.lon]}
              icon={priceIcon(price, price === null ? 0 : step(price), station.id === selectedId, price !== null && price <= cutoff)}
              title={`${station.name}, ${station.city}${price !== null ? `: ${decimal(price, 3)} €` : ''}`}
              zIndexOffset={price === null ? -1000 : Math.round((3 - price) * 1000)}
            >
              <Popup>
                <strong>{station.name}</strong>
                <br />
                {station.address}, {station.postalCode} {station.city}
                <br />
                {price !== null ? `${decimal(price, 3)} € pro ${unit}` : 'Preis nicht veröffentlicht'}
                <br />
                <Link to={`/sprit/${station.id}`}>Details und Verlauf</Link>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
      <div className="map-legend" aria-hidden="true">
        <span>teurer</span>
        {RAMP.map((v) => (
          <span key={v} className="map-legend__step" style={{ background: `var(${v})` }} />
        ))}
        <span>günstiger</span>
        <span className="map-legend__none" /> <span>ohne Preis</span>
        <span className="map-legend__hint">Preisschild: die {LABELLED} günstigsten</span>
      </div>
    </div>
  )
}
