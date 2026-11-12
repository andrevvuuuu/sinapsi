import './styles/tokens.css'
import { applyCachedTheme } from './shell/theme'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

applyCachedTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
