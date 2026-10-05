import type { Metadata, Viewport } from 'next'
import './globals.css'
import { UIProvider } from '@/components/ui/UIProvider'

export const metadata: Metadata = {
  title: 'JitDrive · 智能云盘',
  description: 'Minimal WPS-style cloud drive powered by JitWord iframe SDK'
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1
}

// Root shell only: global providers. The authenticated app chrome (sidebar + top
// bar + access gate) lives in the (drive) route-group layout, so auth pages
// (/login, /register) render bare without it.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <UIProvider>{children}</UIProvider>
      </body>
    </html>
  )
}
