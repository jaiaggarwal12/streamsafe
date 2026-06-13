import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Agent {
  id: string
  name: string
  email: string
  team?: string
  role: string
}

interface AuthStore {
  token: string | null
  agent: Agent | null
  setAuth: (token: string, agent: Agent) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      agent: null,
      setAuth: (token, agent) => set({ token, agent }),
      logout: () => {
        localStorage.removeItem('token')
        localStorage.removeItem('agent')
        set({ token: null, agent: null })
      },
    }),
    {
      name: 'streamsafe-auth',
      partialize: (state) => ({ token: state.token, agent: state.agent }),
    }
  )
)

interface CallStore {
  sessionId: string | null
  participantId: string | null
  sessionToken: string | null
  isAgent: boolean
  isConnected: boolean
  isMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean
  isRecording: boolean
  participants: Record<string, any>
  messages: Array<any>
  bitrate: number
  networkStats: {
    bandwidth_kbps: number
    packet_loss_ratio: number
    rtt_ms: number
    jitter_ms: number
  }
  setSession: (sessionId: string, participantId: string, sessionToken: string, isAgent: boolean) => void
  clearSession: () => void
  setConnected: (v: boolean) => void
  toggleMute: () => void
  toggleVideo: () => void
  setScreenSharing: (v: boolean) => void
  setRecording: (v: boolean) => void
  addParticipant: (id: string, info: any) => void
  removeParticipant: (id: string) => void
  addMessage: (msg: any) => void
  setBitrate: (kbps: number) => void
  setNetworkStats: (stats: any) => void
}

export const useCallStore = create<CallStore>((set) => ({
  sessionId: null,
  participantId: null,
  sessionToken: null,
  isAgent: false,
  isConnected: false,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  isRecording: false,
  participants: {},
  messages: [],
  bitrate: 1500,
  networkStats: { bandwidth_kbps: 0, packet_loss_ratio: 0, rtt_ms: 0, jitter_ms: 0 },

  setSession: (sessionId, participantId, sessionToken, isAgent) =>
    set({ sessionId, participantId, sessionToken, isAgent }),

  clearSession: () =>
    set({
      sessionId: null,
      participantId: null,
      sessionToken: null,
      isConnected: false,
      isMuted: false,
      isVideoOff: false,
      isScreenSharing: false,
      isRecording: false,
      participants: {},
      messages: [],
    }),

  setConnected: (v) => set({ isConnected: v }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleVideo: () => set((s) => ({ isVideoOff: !s.isVideoOff })),
  setScreenSharing: (v) => set({ isScreenSharing: v }),
  setRecording: (v) => set({ isRecording: v }),
  addParticipant: (id, info) => set((s) => ({ participants: { ...s.participants, [id]: info } })),
  removeParticipant: (id) =>
    set((s) => {
      const p = { ...s.participants }
      delete p[id]
      return { participants: p }
    }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setBitrate: (kbps) => set({ bitrate: kbps }),
  setNetworkStats: (stats) => set({ networkStats: stats }),
}))
