import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('agent')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { name: string; email: string; password: string; team?: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
}

// ── Sessions ──────────────────────────────────────────────────────────────────
export const sessionsApi = {
  create: (data: { title?: string }) => api.post('/sessions', data),
  list: (params?: { status?: string; limit?: number }) => api.get('/sessions', { params }),
  get: (id: string) => api.get(`/sessions/${id}`),
  end: (id: string, data?: { issue_resolved?: boolean }) => api.post(`/sessions/${id}/end`, data || {}),
  agentJoin: (id: string) => api.post(`/sessions/${id}/agent-join`),
  join: (data: { invite_token: string; display_name?: string; device_type?: string; browser?: string }) =>
    api.post('/sessions/join', data),
  startRecording: (id: string) => api.post(`/sessions/${id}/start-recording`),
  stopRecording: (id: string) => api.post(`/sessions/${id}/stop-recording`),
  getRecording: (id: string) => api.get(`/sessions/${id}/recording`),
}

// ── Chat ─────────────────────────────────────────────────────────────────────
export const chatApi = {
  history: (sessionId: string) => api.get(`/sessions/${sessionId}/chat`),
  send: (sessionId: string, data: { message_text?: string; file_id?: string }) =>
    api.post(`/sessions/${sessionId}/chat`, data),
  upload: (sessionId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/sessions/${sessionId}/chat/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export const analyticsApi = {
  me: () => api.get('/analytics/me'),
  system: () => api.get('/analytics/system'),
  leaderboard: () => api.get('/analytics/leaderboard'),
}

// ── ABR ───────────────────────────────────────────────────────────────────────
export const abrApi = {
  recommend: (participantId: string, stats: object) =>
    api.post(`/abr/recommend?participant_id=${participantId}`, stats),
}
