import { lazy, Suspense, useEffect, type MouseEvent } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router'
import { IconAuto, IconBolt, IconCart, IconFuel, IconHome, IconMoon, IconStar, IconSun, Mark } from './components/Icons'
import { Loading } from './components/States'
import { useTheme } from './lib/theme'
import { useAlertCheck } from './lib/alerts'
import { Overview } from './views/Overview'

const Fuel = lazy(() => import('./views/Fuel'))
const Station = lazy(() => import('./views/Station'))
const Shops = lazy(() => import('./views/Shops'))
const ProductDetail = lazy(() => import('./views/ProductDetail'))
const Energy = lazy(() => import('./views/Energy'))
const Watchlist = lazy(() => import('./views/Watchlist'))
const About = lazy(() => import('./views/About'))

const NAV = [
  { to: '/', label: 'Übersicht', icon: IconHome, end: true },
  { to: '/sprit', label: 'Sprit', icon: IconFuel },
  { to: '/einkaufen', label: 'Einkaufen', icon: IconCart },
  { to: '/energie', label: 'Energie', icon: IconBolt },
  { to: '/merkliste', label: 'Merkliste', icon: IconStar },
]

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function ThemeToggle() {
  const [theme, cycle] = useTheme()
  const label = theme === 'system' ? 'Farbschema: wie System' : theme === 'dark' ? 'Farbschema: dunkel' : 'Farbschema: hell'
  const Icon = theme === 'system' ? IconAuto : theme === 'dark' ? IconMoon : IconSun
  return (
    <button type="button" className="icon-button" onClick={cycle} aria-label={`${label} – umschalten`} title={label}>
      <Icon />
    </button>
  )
}

function Shell() {
  const alerts = useAlertCheck()
  const skip = (e: MouseEvent) => {
    e.preventDefault()
    document.getElementById('main')?.focus()
  }
  return (
    <>
      <a className="skip-link" href="#main" onClick={skip}>
        Zum Inhalt springen
      </a>
      <header className="masthead">
        <div className="masthead__bar page">
          <NavLink to="/" className="wordmark" aria-label="Gspart! Vorarlberg – zur Übersicht">
            <Mark className="wordmark__mark" />
            <span className="wordmark__name">Gspart!</span>
            <span className="wordmark__region">Vorarlberg</span>
          </NavLink>
          <nav className="mainnav" aria-label="Hauptnavigation">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                {n.label}
                {n.to === '/merkliste' && alerts > 0 && (
                  <span className="nav-badge" aria-label={`${alerts} Preisalarme ausgelöst`}>
                    {alerts}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="masthead__tools">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="app-main">
        <ScrollToTop />
        <Suspense fallback={<div className="page"><Loading /></div>}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/sprit" element={<Fuel />} />
            <Route path="/sprit/:id" element={<Station />} />
            <Route path="/einkaufen/*" element={<Shops />} />
            <Route path="/produkt/:store/:id" element={<ProductDetail />} />
            <Route path="/energie" element={<Energy />} />
            <Route path="/merkliste" element={<Watchlist />} />
            <Route path="/info" element={<About />} />
            <Route path="*" element={<Overview />} />
          </Routes>
        </Suspense>
      </main>
      <footer className="footer page">
        <p>
          Gspart! Vorarlberg sammelt öffentlich verfügbare Preise automatisch und ohne Gewähr. Spritpreise: E-Control
          Spritpreisrechner. Händlerpreise: Online-Shops der Händler, im Geschäft kann es abweichen.
        </p>
        <ul className="footer__links">
          <li>
            <NavLink to="/info">Datenquellen, Grenzen und Datenschutz</NavLink>
          </li>
          <li>
            <a href="https://github.com/jessehaemmerle/price-tracker">Quellcode (GPL-3.0)</a>
          </li>
        </ul>
      </footer>
      <nav className="tabbar" aria-label="Hauptnavigation">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <n.icon />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}

export function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
