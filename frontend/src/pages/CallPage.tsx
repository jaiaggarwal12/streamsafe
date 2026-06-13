import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  Circle, Square, PhoneOff, Send, Copy, CheckCircle, Loader2,
  Users, MessageSquare, BarChart2, ChevronRight
} from 'lucide-react'
import clsx from 'clsx'
import { sessionsApi, chatApi } from '../api'
import { useCallStore, useAuthStore } from '../store'
import { useWebRTC } from '../hooks/useWebRTC'

export default function CallPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { agent } = useAuthStore()
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [ending, setEnding] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'info'>('chat')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    isConnected, isMuted, isVideoOff, isScreenSharing, isRecording,
    messages, bitrate, participants,
    toggleMute, toggleVideo, setScreenSharing, setRecording,
    setSession: setCallSession, clearSession,
  } = useCallStore()

  const { localVideoRef, remoteVideoRef, wsReady, sendChat, startScreenShare, stopScreenShare } = useWebRTC()

  useEffect(() => {
    if (!sessionId) return
    const init = async () => {
      try {
        // Join as agent
        const joinRes = await sessionsApi.agentJoin(sessionId)
        const { participant_id, session_token } = joinRes.data
        setCallSession(sessionId, participant_id, session_token, true)

        // Get session details
        const sessRes = await sessionsApi.get(sessionId)
        setSession(sessRes.data)
      } catch (e: any) {
        alert(e.response?.data?.detail || 'Failed to join session')
        navigate('/')
      }
      setLoading(false)
    }
    init()
    return () => clearSession()
  }, [sessionId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const copyInviteLink = async () => {
    if (!session) return
    const url = session.invite_url || `${window.location.origin}/join?token=${session.invite_token}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleEndCall = async () => {
    if (!sessionId || ending) return
    setEnding(true)
    const resolved = window.confirm('Was the customer issue resolved?')
    try {
      await sessionsApi.end(sessionId, { issue_resolved: resolved })
    } catch { /* ignore */ }
    clearSession()
    navigate('/')
  }

  const handleRecording = async () => {
    if (!sessionId) return
    try {
      if (isRecording) {
        await sessionsApi.stopRecording(sessionId)
        setRecording(false)
      } else {
        await sessionsApi.startRecording(sessionId)
        setRecording(true)
      }
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Recording failed')
    }
  }

  const handleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare()
      setScreenSharing(false)
    } else {
      await startScreenShare()
      setScreenSharing(true)
    }
  }

  const handleSendChat = () => {
    if (!chatInput.trim()) return
    sendChat(chatInput.trim())
    setChatInput('')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !sessionId) return
    try {
      const res = await chatApi.upload(sessionId, file)
      sendChat(`📎 ${file.name}`, res.data.id)
    } catch { alert('File upload failed') }
  }

  const participantCount = Object.keys(participants).length

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-950">
        <Loader2 className="animate-spin text-indigo-400" size={32} />
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className={clsx('w-2 h-2 rounded-full', wsReady ? 'bg-green-400 animate-pulse' : 'bg-red-400')} />
          <span className="text-sm font-medium text-gray-200 truncate max-w-xs">
            {session?.title || 'Support Call'}
          </span>
          {isRecording && (
            <span className="flex items-center gap-1 text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
              <Circle size={8} className="fill-current animate-pulse" /> REC
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Users size={12} /> {participantCount}
          </span>
          <span className="text-xs text-gray-500">{bitrate > 0 ? `${bitrate} kbps` : ''}</span>
          <button onClick={copyInviteLink} className="btn-secondary text-xs py-1">
            {copied ? <CheckCircle size={13} className="text-green-400" /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Invite'}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video area */}
        <div className="flex-1 relative bg-black flex items-center justify-center">
          {/* Remote video (main) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />

          {/* Placeholder when no remote */}
          {participantCount < 2 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
              <Users size={48} className="mb-3" />
              <p className="text-sm">Waiting for customer to join…</p>
              <button onClick={copyInviteLink} className="mt-4 btn-secondary text-xs">
                <Copy size={13} /> Copy invite link
              </button>
            </div>
          )}

          {/* Local video (PiP) */}
          <div className="absolute bottom-4 right-4 w-40 h-28 bg-gray-800 rounded-lg overflow-hidden border border-gray-700 shadow-xl">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {isVideoOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                <VideoOff size={20} className="text-gray-400" />
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <button
              onClick={toggleMute}
              className={clsx(
                'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
              )}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            <button
              onClick={toggleVideo}
              className={clsx(
                'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                isVideoOff ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
              )}
              title={isVideoOff ? 'Enable video' : 'Disable video'}
            >
              {isVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
            </button>

            <button
              onClick={handleScreenShare}
              className={clsx(
                'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                isScreenSharing ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600'
              )}
              title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
            >
              {isScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
            </button>

            <button
              onClick={handleRecording}
              className={clsx(
                'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
              )}
              title={isRecording ? 'Stop recording' : 'Start recording'}
            >
              {isRecording ? <Square size={16} className="fill-current" /> : <Circle size={16} />}
            </button>

            <button
              onClick={handleEndCall}
              disabled={ending}
              className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
              title="End call"
            >
              {ending ? <Loader2 size={18} className="animate-spin" /> : <PhoneOff size={18} />}
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 flex flex-col bg-gray-900 border-l border-gray-800 flex-shrink-0">
          {/* Sidebar tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setSidebarTab('chat')}
              className={clsx(
                'flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors',
                sidebarTab === 'chat' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-500 hover:text-gray-300'
              )}
            >
              <MessageSquare size={13} /> Chat
              {messages.length > 0 && (
                <span className="bg-indigo-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{messages.length}</span>
              )}
            </button>
            <button
              onClick={() => setSidebarTab('info')}
              className={clsx(
                'flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors',
                sidebarTab === 'info' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-500 hover:text-gray-300'
              )}
            >
              <BarChart2 size={13} /> Stats
            </button>
          </div>

          {sidebarTab === 'chat' ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-8">No messages yet</p>
                )}
                {messages.map((msg: any) => (
                  <div
                    key={msg.id}
                    className={clsx('flex flex-col', msg.isSelf ? 'items-end' : 'items-start')}
                  >
                    <span className="text-[10px] text-gray-600 mb-0.5">
                      {msg.isSelf ? 'You' : (msg.role === 'agent' ? 'Agent' : 'Customer')}
                    </span>
                    <div className={clsx(
                      'max-w-[85%] text-xs px-3 py-2 rounded-xl break-words',
                      msg.isSelf
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              <div className="p-3 border-t border-gray-800">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                    placeholder="Type a message…"
                    className="input flex-1 text-xs py-2"
                  />
                  <button onClick={handleSendChat} className="btn-primary px-3 py-2">
                    <Send size={14} />
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-gray-500 hover:text-gray-400 mt-1.5 transition-colors"
                >
                  + Attach file
                </button>
              </div>
            </>
          ) : (
            /* Stats tab */
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Connection</p>
                <div className="space-y-2">
                  <StatRow label="Status" value={wsReady ? '🟢 Connected' : '🔴 Disconnected'} />
                  <StatRow label="Bitrate" value={bitrate > 0 ? `${bitrate} kbps` : '—'} />
                  <StatRow label="Participants" value={String(participantCount)} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Session</p>
                <div className="space-y-2">
                  <StatRow label="ID" value={sessionId?.slice(0, 8) + '…'} />
                  <StatRow label="Recording" value={isRecording ? '🔴 Active' : '⚫ Off'} />
                  <StatRow label="Screen share" value={isScreenSharing ? '✅ On' : '—'} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Participants</p>
                {Object.entries(participants).map(([id, info]: [string, any]) => (
                  <div key={id} className="flex items-center gap-2 py-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-xs text-gray-300">{info.display_name || info.role || 'Unknown'}</span>
                    <span className="text-[10px] text-gray-600 ml-auto">{info.role}</span>
                  </div>
                ))}
                {Object.keys(participants).length === 0 && (
                  <p className="text-xs text-gray-600">No participants yet</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs text-gray-300 font-mono">{value}</span>
    </div>
  )
}
