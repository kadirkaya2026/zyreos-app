'use client'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import api from '@/lib/api'
import { useAuthStore } from '@/store'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'

const txLabels: Record<string, { label: string; color: string }> = {
  deposit: { label: 'Para Yükleme', color: 'text-green-400' },
  withdraw: { label: 'Para Çekme', color: 'text-red-400' },
  bet: { label: 'Bahis', color: 'text-red-400' },
  win: { label: 'Kazanç', color: 'text-green-400' },
}

export default function HesabimPage() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user, refreshBalance } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!user) { router.push('/login'); return }
    refreshBalance()
    api.get('/account/transactions').then(r => setTransactions(r.data)).catch(console.error).finally(() => setLoading(false))
  }, [user])

  return (
    <div className="min-h-screen bg-bg-primary">
      <Header />
      <div className="max-w-3xl mx-auto p-4">
        <div className="bg-bg-secondary border border-border-default rounded-xl p-6 mb-6">
          <div className="text-text-secondary text-sm mb-1">Toplam Bakiye</div>
          <div className="text-3xl font-bold text-accent-green">₺{parseFloat(user?.balance?.toString() || '0').toFixed(2)}</div>
          <div className="text-text-muted text-sm mt-2">{user?.username}</div>
        </div>

        <h2 className="text-base font-bold mb-3">İşlem Geçmişi</h2>

        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="bg-bg-card rounded-xl h-14 animate-pulse" />)}
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center text-text-muted py-12">Henüz işlem yok</div>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => {
              const info = txLabels[tx.type] || { label: tx.type, color: 'text-text-primary' }
              return (
                <div key={tx.id} className="bg-bg-card border border-border-default rounded-xl px-4 py-3 flex justify-between items-center">
                  <div>
                    <div className="text-sm font-medium">{info.label}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {format(new Date(tx.created_at), 'dd MMM yyyy HH:mm', { locale: tr })}
                    </div>
                    {tx.note && <div className="text-xs text-text-muted">{tx.note}</div>}
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${info.color}`}>
                      {tx.amount > 0 ? '+' : ''}₺{parseFloat(tx.amount).toFixed(2)}
                    </div>
                    <div className="text-xs text-text-muted">Bakiye: ₺{parseFloat(tx.balance_after).toFixed(2)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
