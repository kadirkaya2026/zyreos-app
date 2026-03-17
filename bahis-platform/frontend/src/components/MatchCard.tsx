'use client'
import { useBetSlip } from '@/store'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'

interface Match {
  id: string
  home_team: string
  away_team: string
  league: string
  start_time: string
  status: string
  odds_json: Record<string, number>
  score_json?: { home?: number; away?: number }
}

interface Props {
  match: Match
  flashOdds?: Record<string, 'up' | 'down'>
}

export default function MatchCard({ match, flashOdds }: Props) {
  const { selections, addSelection } = useBetSlip()
  const currentSel = selections.find(s => s.matchId === match.id)
  const odds = match.odds_json || {}

  const handleOddClick = (selection: string, value: number, label: string) => {
    addSelection({
      matchId: match.id,
      matchName: `${match.home_team} - ${match.away_team}`,
      league: match.league,
      selection,
      selectionLabel: label,
      odds: value
    })
  }

  const btnClass = (sel: string) =>
    `flex-1 py-2 px-1 rounded-lg text-xs font-bold transition-all border text-center ${
      currentSel?.selection === sel
        ? 'bg-accent-primary border-accent-primary text-white'
        : 'bg-bg-primary border-border-default text-text-primary hover:border-accent-primary hover:text-accent-primary'
    } ${flashOdds?.[sel] === 'up' ? 'odds-flash-up' : flashOdds?.[sel] === 'down' ? 'odds-flash-down' : ''}`

  const overUnderKeys = Object.keys(odds).filter(k => k.startsWith('over_') || k.startsWith('under_'))
  const overKey = overUnderKeys.find(k => k.startsWith('over_'))
  const underKey = overUnderKeys.find(k => k.startsWith('under_'))
  const ouLabel = overKey ? overKey.replace('over_', '').replace('_', '.') : '2.5'

  return (
    <div className={`bg-bg-card border rounded-xl p-4 transition-colors hover:border-border-light ${
      match.status === 'live' ? 'border-red-800' : 'border-border-default'
    }`}>
      <div className="flex justify-between items-center mb-3">
        <div className="text-xs text-text-muted font-medium">{match.league}</div>
        <div className="flex items-center gap-2">
          {match.status === 'live' ? (
            <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-bold animate-pulse">CANLI</span>
          ) : (
            <span className="text-xs text-text-muted">
              {match.start_time && !isNaN(new Date(match.start_time).getTime())
                ? format(new Date(match.start_time), 'dd MMM HH:mm', { locale: tr })
                : '--:--'}
            </span>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium flex-1 text-left">{match.home_team}</div>
        {match.status === 'live' && match.score_json ? (
          <div className="text-lg font-bold text-accent-primary px-3">
            {match.score_json.home ?? 0} - {match.score_json.away ?? 0}
          </div>
        ) : (
          <div className="text-text-muted text-xs px-3">vs</div>
        )}
        <div className="text-sm font-medium flex-1 text-right">{match.away_team}</div>
      </div>

      <div className="space-y-2">
        {(odds.home || odds.draw || odds.away) && (
          <div>
            <div className="text-xs text-text-muted mb-1">Maç Sonucu</div>
            <div className="flex gap-1.5">
              {odds.home && (
                <button onClick={() => handleOddClick('home', odds.home, 'MS1')} className={btnClass('home')}>
                  <div className="text-text-secondary font-normal text-xs">1</div>
                  <div>{odds.home.toFixed(2)}</div>
                </button>
              )}
              {odds.draw && (
                <button onClick={() => handleOddClick('draw', odds.draw, 'MS X')} className={btnClass('draw')}>
                  <div className="text-text-secondary font-normal text-xs">X</div>
                  <div>{odds.draw.toFixed(2)}</div>
                </button>
              )}
              {odds.away && (
                <button onClick={() => handleOddClick('away', odds.away, 'MS2')} className={btnClass('away')}>
                  <div className="text-text-secondary font-normal text-xs">2</div>
                  <div>{odds.away.toFixed(2)}</div>
                </button>
              )}
            </div>
          </div>
        )}

        {(overKey || underKey) && (
          <div>
            <div className="text-xs text-text-muted mb-1">Alt / Üst {ouLabel}</div>
            <div className="flex gap-1.5">
              {overKey && odds[overKey] && (
                <button onClick={() => handleOddClick(overKey, odds[overKey], `Üst ${ouLabel}`)} className={btnClass(overKey)}>
                  <div className="text-text-secondary font-normal text-xs">Üst {ouLabel}</div>
                  <div>{odds[overKey].toFixed(2)}</div>
                </button>
              )}
              {underKey && odds[underKey] && (
                <button onClick={() => handleOddClick(underKey, odds[underKey], `Alt ${ouLabel}`)} className={btnClass(underKey)}>
                  <div className="text-text-secondary font-normal text-xs">Alt {ouLabel}</div>
                  <div>{odds[underKey].toFixed(2)}</div>
                </button>
              )}
            </div>
          </div>
        )}

        {(odds.btts_yes || odds.btts_no) && (
          <div>
            <div className="text-xs text-text-muted mb-1">Karşılıklı Gol</div>
            <div className="flex gap-1.5">
              {odds.btts_yes && (
                <button onClick={() => handleOddClick('btts_yes', odds.btts_yes, 'KG Var')} className={btnClass('btts_yes')}>
                  <div className="text-text-secondary font-normal text-xs">Var</div>
                  <div>{odds.btts_yes.toFixed(2)}</div>
                </button>
              )}
              {odds.btts_no && (
                <button onClick={() => handleOddClick('btts_no', odds.btts_no, 'KG Yok')} className={btnClass('btts_no')}>
                  <div className="text-text-secondary font-normal text-xs">Yok</div>
                  <div>{odds.btts_no.toFixed(2)}</div>
                </button>
              )}
            </div>
          </div>
        )}

        {(odds.dnb_home || odds.dnb_away) && (
          <div>
            <div className="text-xs text-text-muted mb-1">Beraberlikte İade</div>
            <div className="flex gap-1.5">
              {odds.dnb_home && (
                <button onClick={() => handleOddClick('dnb_home', odds.dnb_home, `Bİ 1`)} className={btnClass('dnb_home')}>
                  <div className="text-text-secondary font-normal text-xs">1</div>
                  <div>{odds.dnb_home.toFixed(2)}</div>
                </button>
              )}
              {odds.dnb_away && (
                <button onClick={() => handleOddClick('dnb_away', odds.dnb_away, `Bİ 2`)} className={btnClass('dnb_away')}>
                  <div className="text-text-secondary font-normal text-xs">2</div>
                  <div>{odds.dnb_away.toFixed(2)}</div>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
