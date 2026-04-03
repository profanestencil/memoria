import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RememberHome } from '@/screens/RememberHome'
import { Map } from '@/screens/Map'
import { ARPlaceholder } from '@/screens/ARPlaceholder'
import { Camera } from '@/screens/Camera'
import { Preview } from '@/screens/Preview'

export function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RememberHome />} />
        <Route path="/remember" element={<Navigate to="/camera" replace />} />
        <Route path="/map" element={<Map />} />
        <Route path="/ar" element={<ARPlaceholder />} />
        <Route path="/camera" element={<Camera />} />
        <Route path="/preview" element={<Preview />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
