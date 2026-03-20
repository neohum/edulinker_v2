import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import ToasterProvider from '../components/ToasterProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'edulinker Student',
  description: '학생들을 위한 플러그인 플랫폼',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdn-uicons.flaticon.com/2.6.0/uicons-regular-rounded/css/uicons-regular-rounded.css" />
      </head>
      <body className={`${inter.className} bg-slate-50 text-slate-900 min-h-screen flex flex-col`}>
        <ToasterProvider />
        <header className="bg-indigo-600 text-white shadow-md sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
            <h1 className="text-xl font-bold tracking-tight"><i className="fi fi-rr-graduation-cap" style={{ marginRight: 8 }} />edulinker Student</h1>
            <nav className="flex gap-4 text-sm font-medium">
              <Link href="/" className="hover:text-indigo-200 transition-colors">홈</Link>
              <Link href="/login" className="hover:text-indigo-200 transition-colors">로그인</Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-5xl mx-auto w-full p-6">
          {children}
        </main>

        <footer className="border-t border-slate-200 py-6 text-center text-slate-500 text-sm">
          &copy; {new Date().getFullYear()} edulinker project. All rights reserved.
        </footer>
      </body>
    </html>
  )
}
