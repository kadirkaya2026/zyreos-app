'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      router.replace(user.role === 'admin' ? '/admin' : '/spor')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Giriş başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl font-bold text-accent-primary mb-2">BahisPro</div>
          <div className="text-text-secondary text-sm">Güvenli Bahis Platformu</div>
        </div>

        <div className="bg-bg-secondary rounded-xl border border-border-default p-8">
          <h1 className="text-xl font-bold mb-6 text-center">Giriş Yap</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-text-secondary text-sm mb-2">Kullanıcı Adı</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-bg-card border border-border-default rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent-primary"
                placeholder="Kullanıcı adınız"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-text-secondary text-sm mb-2">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-bg-card border border-border-default rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent-primary"
                placeholder="Şifreniz"
                autoComplete="current-password"
              />
            </div>
            {error && <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent-primary hover:bg-accent-secondary text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
