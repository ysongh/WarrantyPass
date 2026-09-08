import { Route, Routes } from 'react-router'

import AppLayout from './components/layout/AppLayout'
import AddProductPage from './pages/AddProductPage'
import DashboardPage from './pages/DashboardPage'
import HomePage from './pages/HomePage'
import NotFoundPage from './pages/NotFoundPage'
import ProductDetailsPage from './pages/ProductDetailsPage'
import SettingsPage from './pages/SettingsPage'
import TransferProductPage from './pages/TransferProductPage'
import VerifyProductPage from './pages/VerifyProductPage'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/products/new" element={<AddProductPage />} />
        <Route path="/products/:id" element={<ProductDetailsPage />} />
        <Route path="/products/:id/transfer" element={<TransferProductPage />} />
        <Route path="/verify/:id" element={<VerifyProductPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
