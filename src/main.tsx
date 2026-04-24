// Some wallet / crypto deps still expect Node's `Buffer` global (notably on iOS Safari).
// Provide the minimal browser-safe polyfill.
import { Buffer } from 'buffer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { ensureMapboxGlWorkerConfigured } from '@/lib/mapboxWorker'
import './index.css'

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer
}
if (typeof (globalThis as unknown as { global?: unknown }).global === 'undefined') {
  ;(globalThis as unknown as { global: unknown }).global = globalThis
}

ensureMapboxGlWorkerConfigured()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
