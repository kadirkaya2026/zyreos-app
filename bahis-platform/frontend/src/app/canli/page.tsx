'use client'
import { useEffect, useState, useRef } from 'react'
import Header from '@/components/Header'
import BetSlip from '@/components/BetSlip'
import MatchCard from '@/components/MatchCard'
import api from '@/lib/api'
import { useAuthStore } from '@/store'
import { useRouter } from 'next/navigation'
import { io } from 'socket.io-client'

export default function CanliPage() {
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [flashOdds, setFlashOdds] = useState<Record<string, Record<string, 'up' | 'down'>>>({})
  const prevOdds = useRef<Record<string, any>>({})
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!user) { router.push('/login'); return }
    fetchLive()

    const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000')
    socket.on('odds_update', (data: any) => {
      const updated = data.matches?.filter((m: any) => m.status === 'live') || []
      updated.forEach((m: any) => {
        const prev = prevOdds.current[m.id]
        if (prev && m.odds_json) {
          const flash: Record<string, 'up' | 'down'> = {}
          for (const k of ['home', 'draw', 'away']) {
            if (m.odds_json[k] && prev[k]) {
              if (m.odds_json[k] > prev[k]) flash[k] = 'up'
              else if (m.odds_json[k] < prev[k]) flash[k] = 'down'
            }
          }
          setFlashOdds(f => ({ ...f, [m.id]: flash }))
          setTimeout(() => setFlashOdds(f => { const n = { ...f }; delete n[m.id]; return n }), 1000)
        }
        prevOdds.current[m.id] = m.odds_json
      })
      if (updated.length) setMatches(updated)
    })

    const interval = setInterval(fetchLive, 10000)
    return () => { socket.disconnect(); clearInterval(interval) }
  }, [user])

  const fetchLive = async () => {
    try {
      const { data } = await api.get('/matches/live')
      setMatches(data)
      data.forEach((m: any) => { prevOdds.current[m.id] = m.odds_json })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      <Header />
      <div className="flex max-w-screen-xl mx-auto">
        <main className="flex-1 min-w-0 p-4">
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-lg font-bold">Canlı Bahis</h1>
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded font-bold animate-pulse">
              {matches.length} CANLI
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-bg-card border border-border-default rounded-xl p-4 h-32 animate-pulse" />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center text-text-muted py-16">
              <div className="text-4xl mb-4">📺</div>
              <div>Şu an aktif canlı maç yok</div>
              <div className="text-sm mt-2">Maçlar başladığında burada görünecek</div>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map(match => (
                <MatchCard key={match.id} match={match} flashOdds={flashOdds[match.id]} />
              ))}
            </div>
          )}
        </main>

        <aside className="hidden lg:block w-80 p-4 sticky top-14 h-fit">
          <BetSlip />
        </aside>
      </div>
    </div>
  )
}
