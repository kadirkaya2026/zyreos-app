'use client'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import api from '@/lib/api'
import { useAuthStore } from '@/store'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Users, TrendingUp, Ticket, DollarSign, Plus, X } from 'lucide-react'

export default function AdminPage() {
  const [tab, setTab] = useState<'stats' | 'users' | 'bets'>('stats')
  const [stats, setStats] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [bets, setBets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showBalance, setShowBalance] = useState<string | null>(null)
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!user) { router.push('/login'); return }
    if (user.role !== 'admin') { router.push('/spor'); return }
    loadData()
  }, [user])

  const loadData = async () => {
    setLoading(true)
    try {
      const [statsRes, usersRes, betsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/admin/bets'),
      ])
      setStats(statsRes.data)
      setUsers(usersRes.data)
      setBets(betsRes.data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const statusColor: Record<string, string> = {
    pending: 'text-yellow-400', won: 'text-green-400', lost: 'text-red-400'
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      <Header />
      <div className="max-w-5xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-yellow-400">Admin Paneli</h1>
          <button onClick={loadData} className="text-sm text-text-secondary hover:text-text-primary">Yenile</button>
        </div>

        <div className="flex gap-2 mb-6">
          {(['stats', 'users', 'bets'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-accent-primary text-white' : 'bg-bg-card text-text-secondary hover:text-text-primary'
              }`}
            >
              {t === 'stats' ? 'Genel Bakış' : t === 'users' ? 'Kullanıcılar' : 'Kuponlar'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-bg-card rounded-xl h-24 animate-pulse" />)}
          </div>
        ) : tab === 'stats' ? (
          <StatsTab stats={stats} />
        ) : tab === 'users' ? (
          <UsersTab
            users={users}
            showAddUser={showAddUser}
            setShowAddUser={setShowAddUser}
            showBalance={showBalance}
            setShowBalance={setShowBalance}
            onReload={loadData}
          />
        ) : (
          <BetsTab bets={bets} statusColor={statusColor} />
        )}
      </div>
    </div>
  )
}

function StatsTab({ stats }: { stats: any }) {
  if (!stats) return null
  const cards = [
    { label: 'Toplam Kullanıcı', value: stats.totalUsers, icon: Users, color: 'text-blue-400' },
    { label: 'Toplam Kupon', value: stats.totalBets, icon: Ticket, color: 'text-accent-primary' },
    { label: 'Bekleyen Kupon', value: stats.pendingBets, icon: TrendingUp, color: 'text-yellow-400' },
    { label: 'Kasa Kârı', value: `₺${parseFloat(stats.profit || 0).toFixed(2)}`, icon: DollarSign, color: 'text-green-400' },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(card => (
        <div key={card.label} className="bg-bg-card border border-border-default rounded-xl p-4">
          <card.icon size={20} className={`mb-2 ${card.color}`} />
          <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          <div className="text-text-muted text-xs mt-1">{card.label}</div>
        </div>
      ))}
    </div>
  )
}

function UsersTab({ users, showAddUser, setShowAddUser, showBalance, setShowBalance, onReload }: any) {
  const [form, setForm] = useState({ username: '', password: '', balance: '' })
  const [balanceForm, setBalanceForm] = useState({ amount: '', note: '' })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setMsg('')
    try {
      await api.post('/admin/users', { username: form.username, password: form.password, balance: Number(form.balance) || 0 })
      setMsg('Kullanıcı oluşturuldu')
      setForm({ username: '', password: '', balance: '' })
      setShowAddUser(false)
      onReload()
    } catch (e: any) { setErr(e.response?.data?.error || 'Hata') }
  }

  const handleBalance = async (userId: string) => {
    try {
      await api.post(`/admin/users/${userId}/balance`, { amount: Number(balanceForm.amount), note: balanceForm.note || 'Admin işlemi' })
      setBalanceForm({ amount: '', note: '' })
      setShowBalance(null)
      onReload()
    } catch (e: any) { setErr(e.response?.data?.error || 'Hata') }
  }

  const handleToggle = async (userId: string, isActive: boolean) => {
    await api.put(`/admin/users/${userId}`, { is_active: !isActive })
    onReload()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-text-secondary text-sm">{users.length} kullanıcı</div>
        <button
          onClick={() => setShowAddUser(!showAddUser)}
          className="flex items-center gap-2 bg-accent-primary hover:bg-accent-secondary text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Kullanıcı Ekle
        </button>
      </div>

      {showAddUser && (
        <form onSubmit={handleAdd} className="bg-bg-card border border-border-default rounded-xl p-4 mb-4 space-y-3">
          <div className="font-medium text-sm">Yeni Kullanıcı</div>
          <div className="grid grid-cols-3 gap-3">
            <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder="Kullanıcı adı" className="bg-bg-primary border border-border-default rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-primary" />
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Şifre" className="bg-bg-primary border border-border-default rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-primary" />
            <input type="number" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))}
              placeholder="Başlangıç bakiye (₺)" className="bg-bg-primary border border-border-default rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-primary" />
          </div>
          {err && <div className="text-red-400 text-xs">{err}</div>}
          {msg && <div className="text-green-400 text-xs">{msg}</div>}
          <div className="flex gap-2">
            <button type="submit" className="bg-accent-primary text-white px-4 py-2 rounded-lg text-sm font-medium">Oluştur</button>
            <button type="button" onClick={() => setShowAddUser(false)} className="bg-bg-primary text-text-secondary px-4 py-2 rounded-lg text-sm">İptal</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {users.map((u: any) => (
          <div key={u.id} className="bg-bg-card border border-border-default rounded-xl p-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {u.username}
                  {u.role === 'admin' && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">Admin</span>}
                  {!u.is_active && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Pasif</span>}
                </div>
                <div className="text-sm text-text-secondary mt-0.5">Bakiye: <span className="text-green-400 font-bold">₺{parseFloat(u.balance).toFixed(2)}</span></div>
              </div>
              {u.role !== 'admin' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowBalance(showBalance === u.id ? null : u.id)}
                    className="text-xs bg-accent-primary/20 text-accent-primary border border-accent-primary/30 px-3 py-1.5 rounded-lg hover:bg-accent-primary hover:text-white transition-colors"
                  >
                    Bakiye Yükle
                  </button>
                  <button
                    onClick={() => handleToggle(u.id, u.is_active)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      u.is_active ? 'border-red-800 text-red-400 hover:bg-red-900/30' : 'border-green-800 text-green-400 hover:bg-green-900/30'
                    }`}
                  >
                    {u.is_active ? 'Pasife Al' : 'Aktife Al'}
                  </button>
                </div>
              )}
            </div>

            {showBalance === u.id && (
              <div className="mt-3 flex gap-2 flex-wrap">
                <input
                  type="number"
                  value={balanceForm.amount}
                  onChange={e => setBalanceForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="Miktar (₺) — eksi için -"
                  className="bg-bg-primary border border-border-default rounded-lg px-3 py-2 text-sm flex-1 min-w-32 focus:outline-none focus:border-accent-primary"
                />
                <input
                  value={balanceForm.note}
                  onChange={e => setBalanceForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Not (opsiyonel)"
                  className="bg-bg-primary border border-border-default rounded-lg px-3 py-2 text-sm flex-1 min-w-32 focus:outline-none focus:border-accent-primary"
                />
                <button onClick={() => handleBalance(u.id)} className="bg-accent-primary text-white px-4 py-2 rounded-lg text-sm font-medium">Uygula</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function BetsTab({ bets, statusColor }: { bets: any[]; statusColor: Record<string, string> }) {
  const statusLabel: Record<string, string> = { pending: 'Bekliyor', won: 'Kazandı', lost: 'Kaybetti' }

  return (
    <div className="space-y-2">
      {bets.length === 0 ? (
        <div className="text-center text-text-muted py-12">Henüz kupon yok</div>
      ) : bets.map((slip: any) => (
        <div key={slip.id} className="bg-bg-card border border-border-default rounded-xl p-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="font-medium text-sm">{slip.username}</div>
              <div className="text-xs text-text-muted">#{slip.id.slice(0, 8).toUpperCase()}</div>
            </div>
            <div className="text-right">
              <span className={`text-xs font-bold ${statusColor[slip.status]}`}>
                {statusLabel[slip.status] || slip.status}
              </span>
              <div className="text-xs text-text-muted mt-0.5">
                {format(new Date(slip.created_at), 'dd MMM HH:mm', { locale: tr })}
              </div>
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">₺{parseFloat(slip.stake).toFixed(2)} × {parseFloat(slip.total_odds).toFixed(2)}</span>
            <span className="font-bold text-accent-green">₺{parseFloat(slip.potential_win).toFixed(2)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
