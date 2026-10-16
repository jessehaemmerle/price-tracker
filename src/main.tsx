import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/sofia-sans'
import '@fontsource-variable/sofia-sans-condensed'
import './styles/tokens.css'
import './styles/base.css'
import './styles/charts.css'
import './styles/views.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
