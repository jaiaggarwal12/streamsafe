import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, Send, Loader2,
  Shield, MessageSquare
} from 'lucide-react'
import clsx from 'clsx'
import { sessionsApi } from '../api'
import { useCallStore } from '../store'
import { useWebRTC } from '../hooks/useWebRTC'

type Phase = 'form' | 'lobby' | 'call' | 'ended'

export default function JoinPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''

  const [phase, setPhase] = useState<Phase>('form')
  const [displayName, setDisplayName] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [chatInput, setChatInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  const {
    isMuted, isVideoOff, isConnected, messages, bitrate,
    toggleMute, toggleVideo, setSession, clearSession, addMessage,
  } = useCallStore()

  const { localVideoRef, remoteVideoRef, wsReady, sendChat, startScreenShare } = useWebRTC()

  useEffect(() => {
    return () => clearSession()
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleJoin = async () => {
    if (!displayName.trim()) { setError('Please enter your name'); return }
    if (!token) { setError('Invalid invite link'); return }
    setJoining(true)
    setError('')
    try {
      const res = await sessionsApi.join({
        invite_token: token,
        display_name: displayName.trim(),
        device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        browser: getBrowser(),
      })
      const { participant_id, session_id, session_token } = res.data
      setSession(session_id, participant_id, session_token, false)
      setPhase('lobby')
      setTimeout(() => setPhase('call'), 500)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to join session')
    }
    setJoining(false)
  }

  const handleLeave = () => {
    clearSession()
    setPhase('ended')
  }

  const handleSendChat = () => {
    if (!chatInput.trim()) return
    sendChat(chatInput.trim())
    setChatInput('')
  }

  if (phase === 'ended') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="card max-w-sm w-full text-center py-12">
          <PhoneOff size={40} className="text-gray-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">Call ended</h2>
          <p className="text-sm text-gray-500">Thank you for contacting support. You may close this window.</p>
        </div>
      </div>
    )
  }

  if (phase === 'form') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="card max-w-sm w-full">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Video size={18} />
            </div>
            <div>
              <h1 className="font-bold text-sm">StreamSafe Support</h1>
              <p className="text-xs text-gray-500">Video support call</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Your name</label>
              <input
                type="text"
                className="input"
                placeholder="Enter your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                autoFocus
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              className="btn-primary w-full"
              onClick={handleJoin}
              disabled={joining || !token}
            >
              {joining ? <Loader2 size={16} className="animate-spin" /> : <Video size={16} />}
              {joining ? 'Joining…' : 'Join call'}
            </button>

            <div className="flex items-center gap-2 text-xs text-gray-600 pt-2">
              <Shield size={12} />
              <span>No account needed. Call is encrypted end-to-end.</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Call phase
  return (
    <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={clsx('w-2 h-2 rounded-full', wsReady ? 'bg-green-400 animate-pulse' : 'bg-yellow-400')} />
          <span className="text-sm text-gray-300">Support Call</span>
        </div>
        <span className="text-xs text-gray-600">{bitrate > 0 ? `${bitrate} kbps` : ''}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Video */}
        <div className="flex-1 relative bg-black flex items-center justify-center">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />

          {!isConnected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center">
                <Loader2 size={32} className="animate-spin text-indigo-400 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Connecting to agent…</p>
              </div>
            </div>
          )}

          {/* Local PiP */}
          <div className="absolute bottom-4 right-4 w-36 h-24 bg-gray-800 rounded-lg overflow-hidden border border-gray-700 shadow-xl">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {isVideoOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                <VideoOff size={18} className="text-gray-400" />
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <button
              onClick={toggleMute}
              className={clsx(
                'w-10 h-10 rounded-full flex items-center justify-center',
                isMuted ? 'bg-red-500' : 'bg-gray-700 hover:bg-gray-600'
              )}
            >
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              onClick={toggleVideo}
              className={clsx(
                'w-10 h-10 rounded-full flex items-center justify-center',
                isVideoOff ? 'bg-red-500' : 'bg-gray-700 hover:bg-gray-600'
              )}
            >
              {isVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
            </button>
            <button
              onClick={handleLeave}
              className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center"
            >
              <PhoneOff size={18} />
            </button>
          </div>
        </div>

        {/* Chat */}
        <div className="w-64 flex flex-col bg-gray-900 border-l border-gray-800 flex-shrink-0">
          <div className="px-3 py-2.5 border-b border-gray-800 flex items-center gap-2">
            <MessageSquare size={14} className="text-gray-500" />
            <span className="text-xs font-medium text-gray-400">Chat</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-xs text-gray-600 text-center py-8">Chat with your support agent here</p>
            )}
            {messages.map((msg: any) => (
              <div key={msg.id} className={clsx('flex flex-col', msg.isSelf ? 'items-end' : 'items-start')}>
                <span className="text-[10px] text-gray-600 mb-0.5">
                  {msg.isSelf ? 'You' : (msg.role === 'agent' ? 'Support Agent' : 'Customer')}
                </span>
                <div className={clsx(
                  'max-w-[85%] text-xs px-3 py-2 rounded-xl break-words',
                  msg.isSelf ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                )}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="p-3 border-t border-gray-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                placeholder="Message…"
                className="input flex-1 text-xs py-2"
              />
              <button onClick={handleSendChat} className="btn-primary px-3 py-2">
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getBrowser(): string {
  const ua = navigator.userAgent
  if (ua.includes('Firefox')) return 'firefox'
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'safari'
  if (ua.includes('Edg')) return 'edge'
  return 'chrome'
}
