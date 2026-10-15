'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { isRtl, resolveLanguage, translate, type LanguageCode, type Translator } from '@/lib/i18n'

const LANG_KEY = 'hienvs-webui.lang'
const THEME_KEY = 'hienvs-webui.theme'

type ThemeMode = 'light' | 'dark'

interface I18nValue {
  lang: LanguageCode
  dir: 'ltr' | 'rtl'
  t: Translator
  setLang: (lang: LanguageCode) => void
}

interface ThemeValue {
  theme: ThemeMode
  toggle: () => void
}

const I18nContext = createContext<I18nValue | null>(null)
const ThemeContext = createContext<ThemeValue | null>(null)

function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>('en')

  // 首次挂载时按用户偏好 / 系统语言解析，避免静态导出的服务端渲染固定为英语
  useEffect(() => {
    const stored = window.localStorage.getItem(LANG_KEY) ?? undefined
    setLangState(resolveLanguage(stored, window.navigator.language))
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr'
  }, [lang])

  const setLang = useCallback((next: LanguageCode) => {
    window.localStorage.setItem(LANG_KEY, next)
    setLangState(next)
  }, [])

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      dir: isRtl(lang) ? 'rtl' : 'ltr',
      t: (key, params) => translate(lang, key, params),
      setLang
    }),
    [lang, setLang]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>('light')

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored)
      return
    }
    setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const value = useMemo<ThemeValue>(
    () => ({
      theme,
      toggle: () => {
        const next: ThemeMode = theme === 'dark' ? 'light' : 'dark'
        window.localStorage.setItem(THEME_KEY, next)
        setTheme(next)
      }
    }),
    [theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>{children}</I18nProvider>
    </ThemeProvider>
  )
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n 必须在 Providers 内使用')
  return ctx
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme 必须在 Providers 内使用')
  return ctx
}
