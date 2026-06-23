'use client'

import { useIdleTimeout } from '@/hooks/use-idle-timeout'
import { useLanguage } from '@/lib/language-context'

interface Props {
  timeoutMinutes: number
}

export function IdleLogoutGuard({ timeoutMinutes }: Props) {
  const { showWarning, secondsLeft, staySignedIn } = useIdleTimeout(timeoutMinutes)
  const { t } = useLanguage()

  if (!showWarning) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 animate-fade-in">
      <div className="bg-surface rounded-xl shadow-lg p-stack-lg max-w-sm w-full mx-4 text-center">
        <span className="material-symbols-outlined text-[40px] text-tertiary" aria-hidden>schedule</span>
        <h3 className="text-headline-md font-bold text-on-surface mt-2 mb-1">
          {t('Bạn vẫn còn đó không?', 'Are you still there?')}
        </h3>
        <p className="text-label-md text-on-surface-variant mb-stack-lg">
          {t(`Sẽ tự động đăng xuất sau ${secondsLeft} giây do không hoạt động.`, `You will be logged out in ${secondsLeft} seconds due to inactivity.`)}
        </p>
        <button
          onClick={staySignedIn}
          className="w-full bg-primary text-on-primary rounded-xl py-3 text-label-md font-bold min-h-touch-target-min shadow-md active:scale-95 transition-transform"
        >
          {t('Tiếp tục sử dụng', 'Continue')}
        </button>
      </div>
    </div>
  )
}
