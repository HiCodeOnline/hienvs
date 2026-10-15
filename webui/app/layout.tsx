import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { Providers } from '@/components/providers'
import { listRegions } from '@/lib/regions'

export const metadata: Metadata = {
  title: 'HiEnvs Software Sources',
  description: 'Browse and publish software sources for the HiEnvs client.'
}

// 首屏前置应用主题与语言，避免闪烁
const INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('hienvs-webui.theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');var l=localStorage.getItem('hienvs-webui.lang');if(l)document.documentElement.lang=l;}catch(e){}})();`

export default function RootLayout({ children }: { children: ReactNode }) {
  const regions = listRegions()

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Header regions={regions} />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  )
}
