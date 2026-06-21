import type { Metadata } from 'next'
import { Be_Vietnam_Pro } from 'next/font/google'
import './globals.css'

const beVietnamPro = Be_Vietnam_Pro({
  weight: ['400', '500', '700', '800', '900'],
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Lê Gia Kho',
  description: 'Quản lý kho và đơn hàng — Bún riêu Lê Gia',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className={`${beVietnamPro.className} h-full overflow-hidden antialiased`}>
        {children}
      </body>
    </html>
  )
}
