import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import DocEditorTest from './DocEditorTest.jsx'
import './styles.css'

// ?doctest = P0 Tiptap 内核试验台（不影响正式 App）
const Root = window.location.search.includes('doctest') ? DocEditorTest : App

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
