import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProfilePage from './pages/ProfilePage'
import LoginPage from './pages/LoginPage'
import AdminPage from './pages/AdminPage'
import LandingPage from './pages/LandingPage'
import LandingAdminPage from './pages/LandingAdminPage'
import StorePage from './pages/StorePage'
import StoreAdminPage from './pages/StoreAdminPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Perfil Instagram-style */}
        <Route path="/" element={<ProfilePage />} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin" element={<AdminPage />} />

        {/* Landing Page B2B */}
        <Route path="/lp" element={<LandingPage />} />
        <Route path="/lp/admin" element={<LandingAdminPage />} />

        {/* Vitrine / Catálogo de Vendas */}
        <Route path="/store" element={<StorePage />} />
        <Route path="/store/admin" element={<StoreAdminPage />} />
      </Routes>
    </BrowserRouter>
  )
}
