import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { api, User } from '@/lib/api'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      if (!api.isAuthenticated()) {
        setIsLoading(false)
        return
      }

      try {
        const userData = await api.getMe()
        setUser(userData)
      } catch {
        api.logout()
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.login(email, password)
    setUser(response.user)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const response = await api.register(email, password)
    setUser(response.user)
  }, [])

  const logout = useCallback(() => {
    api.logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
