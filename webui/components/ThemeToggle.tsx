'use client'

import { useI18n, useTheme } from './providers'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t(isDark ? 'nav.switchToLight' : 'nav.switchToDark')}
      title={t(isDark ? 'nav.switchToLight' : 'nav.switchToDark')}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800/60 dark:hover:text-white"
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4" />
          <path
            strokeLinecap="round"
            d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
          />
        </svg>
      )}
    </button>
  )
}
