'use client'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import api from '@/lib/api'
import { useAuthStore } from '@/store'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'

const statusColor: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-800',
  won: 'text-green-400 bg-green-400/10 border-green-800',
  lost: 'text-red-400 bg-red-400/10 border-red-800',
}
const statusLabel: Record<string, string> = { pending: 'Bekliyor', won: 'Kazandı', lost: 'Kaybetti' }

export default function KuponlarimPage() {
  const [slips, setSlips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!user) { router.push('/login'); return }
    api.get('/bets/my').then(r => setSlips(r.data)).catch(console.error).finally(() => setLoading(false))
  }, [user])

  return (
    <div className="min-h-screen bg-bg-primary">
      <Header />
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-lg font-bold mb-4">Kuponlarım</h1>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-bg-card rounded-xl h-24 animate-pulse" />)}
          </div>
        ) : slips.length === 0 ? (
          <div className="text-center text-text-muted py-16">Henüz kupon oluşturmadınız</div>
        ) : (
          <div className="space-y-3">
            {slips.map(slip => (
              <div key={slip.id} className="bg-bg-card border border-border-default rounded-xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-xs text-text-muted">
                      {format(new Date(slip.created_at), 'dd MMM yyyy HH:mm', { locale: tr })}
                    </div>
                    <div className="text-sm text-text-secondary mt-0.5">#{slip.id.slice(0, 8).toUpperCase()}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-lg border font-bold ${statusColor[slip.status] || ''}`}>
                    {statusLabel[slip.status] || slip.status}
                  </span>
                </div>

                <div className="space-y-2 mb-3">
                  {slip.bets?.map((bet: any) => (
                    <div key={bet.id} className="flex justify-between text-xs bg-bg-primary rounded-lg p-2">
                      <div>
                        <div className="text-text-secondary">{bet.league}</div>
                        <div className="text-text-primary">{bet.home_team} - {bet.away_team}</div>
                        <div className="text-accent-primary mt-0.5">
                          {bet.selection === 'home' ? 'MS1' : bet.selection === 'draw' ? 'MS0' : 'MS2'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-accent-primary">@{parseFloat(bet.odds).toFixed(2)}</div>
                        <span className={`text-xs ${statusColor[bet.status]?.split(' ')[0] || ''}`}>
                          {statusLabel[bet.status] || bet.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-sm border-t border-border-default pt-3">
                  <div className="space-y-1">
                    <div className="text-text-secondary">Bahis: <span className="text-text-primary font-medium">₺{parseFloat(slip.stake).toFixed(2)}</span></div>
                    <div className="text-text-secondary">Oran: <span className="text-accent-primary font-bold">{parseFloat(slip.total_odds).toFixed(2)}</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-text-secondary text-xs mb-1">Kazanılabilir</div>
                    <div className={`font-bold text-lg ${slip.status === 'won' ? 'text-green-400' : slip.status === 'lost' ? 'text-red-400' : 'text-text-primary'}`}>
                      ₺{parseFloat(slip.potential_win).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
