export function LoadingScreen() {
  return (
    <div className="h-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 animate-fade-in">
        <div className="w-10 h-10 border-4 border-outline-variant border-t-primary rounded-full animate-spin" />
        <p className="text-label-vi text-on-surface-variant">Đang tải...</p>
      </div>
    </div>
  )
}
