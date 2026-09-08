import { Route, Routes } from 'react-router'

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
    // Temporary container. The shared app shell replaces this in the next step.
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/products/new" element={<AddProductPage />} />
        <Route path="/products/:id" element={<ProductDetailsPage />} />
        <Route path="/products/:id/transfer" element={<TransferProductPage />} />
        <Route path="/verify/:id" element={<VerifyProductPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </main>
  )
}

export default App
