import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Permissions } from '@/screens/Permissions'
import { Camera } from '@/screens/Camera'
import { Preview } from '@/screens/Preview'
import { Map } from '@/screens/Map'
import { AR } from '@/screens/AR'
import { Profile } from '@/screens/Profile'

export function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Permissions />} />
        <Route path="/camera" element={<Camera />} />
        <Route path="/preview" element={<Preview />} />
        <Route path="/map" element={<Map />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/ar/:tokenId" element={<AR />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
