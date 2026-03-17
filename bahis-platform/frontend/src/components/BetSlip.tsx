'use client'
import { useBetSlip, useAuthStore } from '@/store'
import { X, Trash2 } from 'lucide-react'
import { useState } from 'react'
import api from '@/lib/api'

export default function BetSlip() {
  const { selections, stake, removeSelection, clearSlip, setStake } = useBetSlip()
  const { refreshBalance } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1)
  const potentialWin = (stake * totalOdds).toFixed(2)

  const selectionLabels: Record<string, string> = {
    home: 'MS1', draw: 'MS0', away: 'MS2'
  }

  const handleBet = async () => {
    if (!selections.length) return
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await api.post('/bets', {
        selections: selections.map(s => ({ matchId: s.matchId, selection: s.selection })),
        stake
      })
      setMessage('Kupon başarıyla oluşturuldu!')
      clearSlip()
      await refreshBalance()
      setTimeout(() => setMessage(''), 3000)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-bg-secondary border border-border-default rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
        <div className="font-bold text-sm flex items-center gap-2">
          Kupon Sepeti
          {selections.length > 0 && (
            <span className="bg-accent-primary text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {selections.length}
            </span>
          )}
        </div>
        {selections.length > 0 && (
          <button onClick={clearSlip} className="text-text-muted hover:text-red-400 transition-colors">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {selections.length === 0 ? (
        <div className="p-6 text-center text-text-muted text-sm">
          Bahis eklemek için oran seçin
        </div>
      ) : (
        <div className="p-3 space-y-2">
          {selections.map(sel => (
            <div key={sel.matchId} className="bg-bg-card rounded-lg p-3 text-xs">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-text-secondary mb-0.5">{sel.league}</div>
                  <div className="font-medium text-text-primary">{sel.matchName}</div>
                  <div className="text-accent-primary mt-1 font-bold">
                    {selectionLabels[sel.selection] || sel.selection} @ {sel.odds.toFixed(2)}
                  </div>
                </div>
                <button onClick={() => removeSelection(sel.matchId)} className="text-text-muted hover:text-red-400 ml-2">
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}

          <div className="border-t border-border-default pt-3 mt-3 space-y-3">
            <div className="flex justify-between text-xs text-text-secondary">
              <span>Toplam Oran</span>
              <span className="text-accent-primary font-bold">{totalOdds.toFixed(2)}</span>
            </div>

            <div>
              <label className="text-xs text-text-secondary block mb-1">Bahis Miktarı (₺)</label>
              <input
                type="number"
                value={stake}
                onChange={e => setStake(Math.max(1, Number(e.target.value)))}
                min={1}
                className="w-full bg-bg-primary border border-border-default rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-primary"
              />
            </div>

            <div className="flex justify-between text-sm font-bold">
              <span className="text-text-secondary">Kazanılabilir</span>
              <span className="text-accent-green">₺{potentialWin}</span>
            </div>

            {message && <div className="text-accent-green text-xs text-center">{message}</div>}
            {error && <div className="text-red-400 text-xs text-center">{error}</div>}

            <button
              onClick={handleBet}
              disabled={loading}
              className="w-full bg-accent-primary hover:bg-accent-secondary text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? 'Gönderiliyor...' : 'Kuponu Onayla'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
