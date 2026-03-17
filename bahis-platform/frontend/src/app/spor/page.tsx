'use client'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import BetSlip from '@/components/BetSlip'
import MatchCard from '@/components/MatchCard'
import api from '@/lib/api'
import { useAuthStore } from '@/store'
import { useRouter } from 'next/navigation'
import { io } from 'socket.io-client'

const LEAGUES = ['Tümü', 'SÜPER LIG', 'PREMIER LEAGUE', 'LA LIGA', 'BUNDESLIGA', 'SERIE A', 'CHAMPIONS LEAGUE', 'LIGUE 1', 'EUROPA LEAGUE']

export default function SporPage() {
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeLeague, setActiveLeague] = useState('Tümü')
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!user) { router.push('/login'); return }
    fetchMatches()

    const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000')
    socket.on('odds_update', (data: any) => {
      if (data.matches) setMatches(data.matches)
    })
    return () => { socket.disconnect() }
  }, [user])

  const fetchMatches = async () => {
    try {
      const { data } = await api.get('/matches')
      setMatches(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = activeLeague === 'Tümü'
    ? matches
    : matches.filter(m => m.league === activeLeague)

  const leagues = ['Tümü', ...Array.from(new Set(matches.map(m => m.league)))]

  return (
    <div className="min-h-screen bg-bg-primary">
      <Header />
      <div className="flex max-w-screen-xl mx-auto">
        <main className="flex-1 min-w-0 p-4">
          <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
            {leagues.map(league => (
              <button
                key={league}
                onClick={() => setActiveLeague(league)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  activeLeague === league
                    ? 'bg-accent-primary border-accent-primary text-white'
                    : 'bg-bg-card border-border-default text-text-secondary hover:text-text-primary'
                }`}
              >
                {league}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-bg-card border border-border-default rounded-xl p-4 h-32 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-text-muted py-16">Maç bulunamadı</div>
          ) : (
            <div className="space-y-3">
              {filtered.map(match => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          )}
        </main>

        <aside className="hidden lg:block w-80 p-4 sticky top-14 h-fit">
          <BetSlip />
        </aside>
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 p-3 bg-bg-primary border-t border-border-default">
        <MobileBetSlipToggle />
      </div>
    </div>
  )
}

function MobileBetSlipToggle() {
  const [open, setOpen] = useState(false)
  const { selections } = require('@/store').useBetSlip()

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="w-full bg-accent-primary text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"
      >
        Kupon Sepeti
        {selections.length > 0 && (
          <span className="bg-white text-accent-primary text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
            {selections.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute bottom-16 left-3 right-3">
          <BetSlip />
        </div>
      )}
    </>
  )
}
