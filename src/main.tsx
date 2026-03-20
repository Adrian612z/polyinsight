import './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import App from './App'
import './index.css'
import { ThemeProvider, useTheme } from './lib/theme'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID

if (!privyAppId) {
  throw new Error('Missing VITE_PRIVY_APP_ID environment variable')
}

const ThemedPrivyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { resolvedTheme } = useTheme()

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'wallet', 'google'],
        appearance: {
          theme: resolvedTheme,
          accentColor: '#ff5a6b',
          logo: undefined,
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'off',
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ThemedPrivyProvider>
        <App />
      </ThemedPrivyProvider>
    </ThemeProvider>
  </StrictMode>,
)
