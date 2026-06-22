'use client'

import { useIdleTimeout } from '@/hooks/use-idle-timeout'

interface Props {
  timeoutMinutes: number
}

export function IdleLogoutGuard({ timeoutMinutes }: Props) {
  const { showWarning, secondsLeft, staySignedIn } = useIdleTimeout(timeoutMinutes)

  if (!showWarning) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 animate-fade-in">
      <div className="bg-surface rounded-xl shadow-lg p-stack-lg max-w-sm w-full mx-4 text-center">
        <span className="material-symbols-outlined text-[40px] text-tertiary" aria-hidden>schedule</span>
        <h3 className="text-headline-md font-bold text-on-surface mt-2 mb-1">Bạn vẫn còn đó không?</h3>
        <p className="text-label-en text-on-surface-variant mb-stack-lg">
          Sẽ tự động đăng xuất sau {secondsLeft} giây do không hoạt động.
        </p>
        <button
          onClick={staySignedIn}
          className="w-full bg-primary text-on-primary rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min shadow-md active:scale-95 transition-transform"
        >
          Tiếp tục sử dụng
        </button>
      </div>
    </div>
  )
}
