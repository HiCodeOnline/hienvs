// 侧边活动栏（VS Code 风格）：仅图标 + 悬浮提示，激活项带左侧强调条
// 设置与主题切换固定在底部
import type { ReactNode } from 'react'
import { useAppStore, type Page } from '../../stores/app'
import { useTasksStore } from '../../stores/tasks'
import { useI18n } from '../../stores/i18n'

const MAIN_NAV: { id: Page; label: string; icon: ReactNode }[] = [
  {
    id: 'tools',
    label: 'nav.tools',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
      </svg>
    )
  },
  {
    id: 'tasks',
    label: 'nav.tasks',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
]

const SETTINGS_ITEM: { id: Page; label: string; icon: ReactNode } = {
  id: 'settings',
  label: 'nav.settings',
  icon: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function NavButton({ item }: { item: { id: Page; label: string; icon: ReactNode } }) {
  const page = useAppStore((s) => s.page)
  const navigate = useAppStore((s) => s.navigate)
  const runningCount = useTasksStore((s) => s.runningCount)
  const t = useI18n()
  const active = page === item.id || (item.id === 'tools' && page === 'tool-detail')

  return (
    <button
      title={t(item.label)}
      onClick={() => navigate(item.id)}
      className={`relative flex h-12 w-12 items-center justify-center transition-colors ${
        active
          ? 'text-brand-600 dark:text-brand-300'
          : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-200'
      }`}
    >
      {active && <span className="absolute start-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-e-full bg-brand-500" />}
      {item.icon}
      {item.id === 'tasks' && runningCount > 0 && (
        <span className="absolute end-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-semibold text-white">
          {runningCount}
        </span>
      )}
    </button>
  )
}

export function Sidebar() {
  const dark = useAppStore((s) => s.dark)
  const toggleDark = useAppStore((s) => s.toggleDark)
  const t = useI18n()

  return (
    <aside className="flex w-12 shrink-0 flex-col items-center">
      <nav className="flex flex-1 flex-col items-center gap-0.5 pt-2">
        {MAIN_NAV.map((item) => (
          <NavButton key={item.id} item={item} />
        ))}
      </nav>

      <div className="flex flex-col items-center pb-2">
        <NavButton item={SETTINGS_ITEM} />
        <button
          title={dark ? t('nav.switchToLight') : t('nav.switchToDark')}
          onClick={toggleDark}
          className="flex h-12 w-12 items-center justify-center text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-200"
        >
          {dark ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
          )}
        </button>
      </div>
    </aside>
  )
}
