import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { WagmiProvider } from 'wagmi'
import './index.css'
import App from './App.tsx'
import AuthProvider from './components/auth/AuthProvider.tsx'
import { wagmiConfig } from './lib/wagmi.ts'

// wagmi caches chain and account state through react-query, and product
// queries reuse the same client.
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {/*
          AuthProvider sits above the router so the anonymous Supabase session
          is requested once on start-up rather than per route. It is below
          QueryClientProvider because product queries key off the user id it
          publishes.
        */}
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
