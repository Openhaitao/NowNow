import React from 'react'
import ReactDOM from 'react-dom/client'
// Geist Sans 的 @font-face 改到 styles.css 里自托管 + unicode-range 限定拉丁
// （@fontsource 的 face 没 unicode-range，会让 Geist 抢去渲染中文标点成英文样）。
import App from './App.jsx'
import { initTheme } from './lib/theme'
import './styles.css'

initTheme() // 应用 light/dark（data-theme），尽量在渲染前

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
