import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE } from './lib/mobile.js'
import { loadExerciseCatalogue } from './lib/exercises.js'
import './index.css'

const render = () => createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
if (MOBILE) render()
else loadExerciseCatalogue().finally(render)

// Not in the mobile build: the native shell already serves everything from disk.
if (!MOBILE && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
