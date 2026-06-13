import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Video, Plus, Copy, CheckCircle, Circle, Clock, PhoneOff, Loader2 } from 'lucide-react'
import { sessionsApi } from '../api'
import { useAuthStore } from '../store'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'

interface Session {
  id: string
  title: string
  status: string
  recording_status: string
  created_at: string
  ended_at?: string
  duration_seconds?: number
  issue_resolved?: boolean
  invite_token?: string
  invite_url?: string
  participant_count: number
}

export default function DashboardPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const { agent } = useAuthStore()
  const navigate = useNavigate()

  const loadSessions = async () => {
    try {
      const res = await sessionsApi.list()
      setSessions(res.data)
    } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => { loadSessions() }, [])

  const createSession = async () => {
    setCreating(true)
    try {
      const res = await sessionsApi.create({ title: `Support Call - ${new Date().toLocaleTimeString()}` })
      const session = res.data
      setSessions((prev) => [session, ...prev])
      navigate(`/call/${session.id}`)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to create session')
    } finally {
      setCreating(false)
    }
  }

  const copyInviteLink = async (session: Session) => {
    const url = session.invite_url || `${window.location.origin}/join?token=${session.invite_token}`
    await navigator.clipboard.writeText(url)
    setCopied(session.id)
    setTimeout(() => setCopied(null), 2000)
  }

  const statusIcon = (status: string) => {
    if (status === 'active') return <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
    if (status === 'ended') return <span className="inline-block w-2 h-2 rounded-full bg-gray-500" />
    return <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />
  }

  const formatDuration = (secs?: number) => {
    if (!secs) return '—'
    const m = Math.floor(secs / 60), s = secs % 60
    return `${m}m ${s}s`
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Sessions</h1>
          <p className="text-sm text-gray-400">Welcome back, {agent?.name}</p>
        </div>
        <button className="btn-primary" onClick={createSession} disabled={creating}>
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          New Session
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading sessions…
        </div>
      ) : sessions.length === 0 ? (
        <div className="card text-center py-16">
          <Video size={40} className="text-gray-600 mx-auto mb-4" />
          <h3 className="font-medium text-gray-300 mb-2">No sessions yet</h3>
          <p className="text-sm text-gray-500 mb-4">Create your first support session to get started</p>
          <button className="btn-primary mx-auto" onClick={createSession}>
            <Plus size={16} /> New Session
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div key={s.id} className="card hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-1.5 pt-0.5">
                    {statusIcon(s.status)}
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">{s.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                      </span>
                      {s.duration_seconds && (
                        <span>{formatDuration(s.duration_seconds)}</span>
                      )}
                      {s.issue_resolved !== null && s.issue_resolved !== undefined && (
                        <span className={clsx(
                          'flex items-center gap-1',
                          s.issue_resolved ? 'text-green-400' : 'text-red-400'
                        )}>
                          {s.issue_resolved ? <CheckCircle size={11} /> : <Circle size={11} />}
                          {s.issue_resolved ? 'Resolved' : 'Unresolved'}
                        </span>
                      )}
                      {s.recording_status === 'ready' && (
                        <span className="text-brand-400">● Recording ready</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {s.status !== 'ended' && (
                    <button
                      onClick={() => copyInviteLink(s)}
                      className="btn-secondary text-xs py-1"
                      title="Copy invite link"
                    >
                      {copied === s.id ? <CheckCircle size={13} className="text-green-400" /> : <Copy size={13} />}
                      {copied === s.id ? 'Copied!' : 'Copy link'}
                    </button>
                  )}
                  {s.status !== 'ended' && (
                    <button
                      onClick={() => navigate(`/call/${s.id}`)}
                      className="btn-primary text-xs py-1"
                    >
                      <Video size={13} />
                      {s.status === 'active' ? 'Rejoin' : 'Start'}
                    </button>
                  )}
                  {s.status === 'ended' && (
                    <span className="text-xs text-gray-600 flex items-center gap-1">
                      <PhoneOff size={12} /> Ended
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
