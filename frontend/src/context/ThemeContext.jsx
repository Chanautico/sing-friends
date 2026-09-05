import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const ThemeContext = createContext(null)

export const THEMES = [
  { id: 'neon', label: 'Neon', swatch: ['#d946ef', '#22d3ee'] },
  { id: 'sunset', label: 'Sunset', swatch: ['#f97316', '#ec4899'] },
  { id: 'ocean', label: 'Ocean', swatch: ['#0ea5e9', '#14b8a6'] },
  { id: 'mono', label: 'Mono', swatch: ['#e2e8f0', '#94a3b8'] },
]
const VALID_IDS = THEMES.map((t) => t.id)
const STORAGE_KEY = 'sf_theme'

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return VALID_IDS.includes(saved) ? saved : 'neon'
  })

  // Sem conta de usuário: o tema é só uma preferência do NAVEGADOR, não da pessoa —
  // se ela trocar de dispositivo, escolhe de novo. É a troca natural de não ter login.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = useCallback((id) => {
    if (VALID_IDS.includes(id)) setThemeState(id)
  }, [])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme precisa ser usado dentro de <ThemeProvider>')
  return ctx
}
