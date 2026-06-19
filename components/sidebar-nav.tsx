'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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

  const tabs: Tab[] = [
    { href: '/kho',       labelVi: 'Kho',       labelEn: 'Inventory',    icon: 'inventory_2' },
    { href: '/dat-mon',   labelVi: 'Đặt món',   labelEn: 'Place Order',  icon: 'add_shopping_cart' },
    { href: '/dang-chay', labelVi: 'Đang chạy', labelEn: 'Active Orders', icon: 'receipt_long', badge: readyCount },
  ]

  if (role === 'manager') {
    tabs.push({ href: '/settings', labelVi: 'Cài đặt', labelEn: 'Settings', icon: 'settings' })
  }

  return (
    <nav aria-label="Navigation chính" className="py-2">
      {tabs.map(tab => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              active
                ? 'bg-tertiary-fixed text-on-tertiary-fixed rounded-lg mx-2 my-1 px-4 py-3 flex items-center gap-3 border-l-4 border-primary'
                : 'text-on-surface-variant rounded-lg mx-2 my-1 px-4 py-3 flex items-center gap-3 hover:bg-surface-container-highest transition-all'
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
              <span className="bg-error text-on-error text-[11px] font-black rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                {tab.badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
