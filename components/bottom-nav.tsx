'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/lib/types'

interface Props {
  role: UserRole
  readyCount: number
}

export function BottomNav({ role, readyCount }: Props) {
  const pathname = usePathname()

  const tabs = [
    { href: '/kho',       labelVi: 'Kho',       icon: 'inventory_2' },
    { href: '/dat-mon',   labelVi: 'Đặt món',   icon: 'add_shopping_cart' },
    { href: '/dang-chay', labelVi: 'Đang chạy', icon: 'receipt_long', badge: readyCount },
    ...(role === 'manager' ? [{ href: '/settings', labelVi: 'Cài đặt', icon: 'settings' }] : []),
  ]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex bg-surface border-t border-outline-variant md:hidden"
      aria-label="Navigation chính"
    >
      {tabs.map(tab => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex flex-1 flex-col items-center justify-center min-h-touch-target-min text-[11px] font-bold gap-0.5 transition-colors ${
              active
                ? 'text-primary border-t-2 border-primary -mt-px'
                : 'text-on-surface-variant'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
              {tab.icon}
            </span>
            <span>{tab.labelVi}</span>
            {'badge' in tab && tab.badge != null && tab.badge > 0 && (
              <span className="absolute top-2 right-[calc(50%-18px)] bg-error text-on-error text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {tab.badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
