import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { register_service_worker } from './utils/service-worker'
import { lock_phone_portrait } from './utils/orientation-lock'

register_service_worker()
lock_phone_portrait()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)