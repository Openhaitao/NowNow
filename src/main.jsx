import React from 'react'
import ReactDOM from 'react-dom/client'
// Geist Sans（Latin，font-display:swap，未加载到优雅回退系统 sans；中文走系统）。家族名 = "Geist Sans"
import '@fontsource/geist-sans/400.css'
import '@fontsource/geist-sans/500.css'
import '@fontsource/geist-sans/600.css'
import App from './App.jsx'
import { initTheme } from './lib/theme'
import './styles.css'

initTheme() // 应用 light/dark（data-theme），尽量在渲染前

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
