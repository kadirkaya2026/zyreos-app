'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { Trophy, Tv, Star, User, LogOut, BarChart3 } from 'lucide-react'

const navItems = [
  { href: '/spor', label: 'Spor', icon: Trophy },
  { href: '/canli', label: 'Canlı', icon: Tv, badge: 'CANLI' },
  { href: '/kuponlarim', label: 'Kuponlarım', icon: Star },
  { href: '/hesabim', label: 'Hesabım', icon: User },
]

export default function Header() {
  const { user, logout } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  return (
    <header className="bg-bg-secondary border-b border-border-default sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-6">
          <Link href="/spor" className="text-xl font-bold text-accent-primary">BahisPro</Link>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname.startsWith(item.href)
                    ? 'bg-bg-card text-accent-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
                }`}
              >
                <item.icon size={16} />
                {item.label}
                {item.badge && (
                  <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded font-bold animate-pulse">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
            {user?.role === 'admin' && (
              <Link
                href="/admin"
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname.startsWith('/admin') ? 'bg-bg-card text-accent-primary' : 'text-yellow-400 hover:bg-bg-card'
                }`}
              >
                <BarChart3 size={16} />Admin
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-bg-card border border-border-default rounded-lg px-3 py-1.5 text-sm">
            <span className="text-text-secondary">Bakiye: </span>
            <span className="text-accent-green font-bold">₺{parseFloat(user?.balance?.toString() || '0').toFixed(2)}</span>
          </div>
          <span className="text-text-secondary text-sm hidden sm:block">{user?.username}</span>
          <button onClick={handleLogout} className="text-text-secondary hover:text-red-400 transition-colors p-2">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <nav className="md:hidden flex items-center gap-1 px-2 pb-2 overflow-x-auto">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              pathname.startsWith(item.href)
                ? 'bg-bg-card text-accent-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <item.icon size={14} />
            {item.label}
          </Link>
        ))}
        {user?.role === 'admin' && (
          <Link href="/admin" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-yellow-400">
            <BarChart3 size={14} />Admin
          </Link>
        )}
      </nav>
    </header>
  )
}
