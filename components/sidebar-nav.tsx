'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLayoutEffect, useRef, useState } from 'react'
import { CountBadge } from './count-badge'
import type { UserRole } from '@/lib/types'

interface Tab {
  href: string
  labelVi: string
  labelEn: string
  icon: string
  badge?: number
}

interface Props {
  role: UserRole
  readyCount: number
}

export function SidebarNav({ role, readyCount }: Props) {
  const pathname = usePathname()
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null)

  const tabs: Tab[] = role === 'foh'
    ? [
        { href: '/dat-mon',   labelVi: 'Đặt món',   labelEn: 'Place Order',  icon: 'add_shopping_cart' },
        { href: '/dang-chay', labelVi: 'Đang chạy', labelEn: 'Active Orders', icon: 'receipt_long', badge: readyCount },
      ]
    : [
        { href: '/kho',       labelVi: 'Kho',       labelEn: 'Inventory',    icon: 'inventory_2' },
        { href: '/dat-mon',   labelVi: 'Đặt món',   labelEn: 'Place Order',  icon: 'add_shopping_cart' },
        { href: '/dang-chay', labelVi: 'Đang chạy', labelEn: 'Active Orders', icon: 'receipt_long', badge: readyCount },
      ]

  if (role === 'manager') {
    tabs.push({ href: '/kitchen',  labelVi: 'Bếp',      labelEn: 'Kitchen',  icon: 'kitchen' })
    tabs.push({ href: '/register', labelVi: 'Thu ngân', labelEn: 'Register', icon: 'point_of_sale' })
    tabs.push({ href: '/settings', labelVi: 'Cài đặt', labelEn: 'Settings', icon: 'settings' })
  }

  if (role === 'manager' || role === 'owner') {
    tabs.push({ href: '/analytics', labelVi: 'Thống kê', labelEn: 'Analytics', icon: 'bar_chart' })
  }

  const activeIndex = tabs.findIndex(tab => pathname.startsWith(tab.href))

  useLayoutEffect(() => {
    function measure() {
      const activeEl = linkRefs.current[activeIndex]
      if (activeEl) setIndicator({ top: activeEl.offsetTop, height: activeEl.offsetHeight })
    }

    measure()

    // The icon font (loaded via a plain <link>, not next/font) can swap in
    // after this first measurement and change link heights — re-measure
    // once everything's actually settled, plus on resize.
    document.fonts?.ready.then(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [activeIndex, tabs.length])

  return (
    <nav aria-label="Navigation chính" className="relative py-2">
      {indicator && (
        <div
          className="absolute left-2 right-2 bg-tertiary-fixed rounded-lg transition-all duration-300 ease-out"
          style={{ top: indicator.top, height: indicator.height }}
          aria-hidden
        />
      )}
      {tabs.map((tab, i) => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            ref={el => { linkRefs.current[i] = el }}
            className={
              active
                ? 'relative z-10 text-on-tertiary-fixed rounded-lg mx-2 my-1 px-4 py-3 flex items-center gap-3 border-l-4 border-primary'
                : 'relative z-10 text-on-surface-variant rounded-lg mx-2 my-1 px-4 py-3 flex items-center gap-3 hover:bg-surface-container-highest transition-all'
            }
            aria-current={active ? 'page' : undefined}
          >
            <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
              {tab.icon}
            </span>
            <span className="flex-1">
              <span className="block text-label-vi font-bold leading-tight">{tab.labelVi}</span>
              <span className="block text-label-en leading-tight opacity-70">{tab.labelEn}</span>
            </span>
            {tab.badge != null && tab.badge > 0 && (
              <CountBadge
                count={tab.badge}
                className="bg-error text-on-error text-[11px] font-black rounded-full min-w-[20px] h-5 flex items-center justify-center px-1"
              />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
