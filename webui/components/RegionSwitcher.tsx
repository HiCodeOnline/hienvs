'use client'

import { useRouter } from 'next/navigation'
import type { RegionMeta } from '@/lib/regions'
import { regionLabel } from '@/lib/i18n'
import { Dropdown } from './Dropdown'
import { useI18n } from './providers'

interface RegionSwitcherProps {
  regions: RegionMeta[]
  current?: string
}

/** 地区切换：切换即改变软件源数据（类似应用商店切换不同地区） */
export function RegionSwitcher({ regions, current }: RegionSwitcherProps) {
  const router = useRouter()
  const { t } = useI18n()
  const active = regions.find((r) => r.code === current)

  return (
    <Dropdown
      label={t('site.region')}
      width="w-56"
      button={
        <>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"
            />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          <span className="max-w-28 truncate">{active ? regionLabel(t, active) : t('site.region')}</span>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </>
      }
      items={[
        {
          key: '__root__',
          label: t('site.chooseRegion'),
          hint: '⌂',
          active: !current,
          onSelect: () => router.push('/')
        },
        ...regions.map((r) => ({
          key: r.code,
          label: regionLabel(t, r),
          hint: r.code,
          active: r.code === current,
          onSelect: () => router.push(`/${r.code}/`)
        }))
      ]}
    />
  )
}
