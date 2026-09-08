import { Outlet } from 'react-router'

import Header from './Header'

/**
 * The shared application shell. Used as a layout route, so every page nested
 * inside it renders through the `Outlet` below with the same header and
 * content width.
 */
function AppLayout() {
  return (
    <div className="min-h-screen bg-canvas">
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <Outlet />
      </main>
    </div>
  )
}

export default AppLayout
