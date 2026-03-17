import { create } from 'zustand'
import api from '@/lib/api'

interface User {
  id: string
  username: string
  role: string
  balance: number
}

interface BetSelection {
  matchId: string
  matchName: string
  league: string
  selection: string
  selectionLabel: string
  odds: number
}

interface AuthStore {
  user: User | null
  token: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshBalance: () => Promise<void>
}

interface BetSlipStore {
  selections: BetSelection[]
  stake: number
  addSelection: (sel: BetSelection) => void
  removeSelection: (matchId: string) => void
  clearSlip: () => void
  setStake: (amount: number) => void
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || 'null') : null,
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,

  login: async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    set({ user: data.user, token: data.token })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ user: null, token: null })
  },

  refreshBalance: async () => {
    const { data } = await api.get('/account/balance')
    const user = get().user
    if (user) {
      const updated = { ...user, balance: data.balance }
      localStorage.setItem('user', JSON.stringify(updated))
      set({ user: updated })
    }
  }
}))

export const useBetSlip = create<BetSlipStore>((set, get) => ({
  selections: [],
  stake: 10,

  addSelection: (sel) => {
    const existing = get().selections.find(s => s.matchId === sel.matchId)
    if (existing) {
      if (existing.selection === sel.selection) {
        set(state => ({ selections: state.selections.filter(s => s.matchId !== sel.matchId) }))
      } else {
        set(state => ({ selections: state.selections.map(s => s.matchId === sel.matchId ? sel : s) }))
      }
    } else {
      set(state => ({ selections: [...state.selections, sel] }))
    }
  },

  removeSelection: (matchId) =>
    set(state => ({ selections: state.selections.filter(s => s.matchId !== matchId) })),

  clearSlip: () => set({ selections: [], stake: 10 }),

  setStake: (amount) => set({ stake: amount })
}))
