import { useRef, useEffect, useCallback, useState } from 'react'
import { useCallStore } from '../store'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export function useWebRTC() {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [wsReady, setWsReady] = useState(false)
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptsRef = useRef(0)

  const {
    sessionId, participantId, sessionToken, isMuted, isVideoOff,
    setConnected, addParticipant, removeParticipant, addMessage,
    setBitrate, participants,
  } = useCallStore()

  const WS_URL = import.meta.env.VITE_WS_URL || ''

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (!sessionId || !sessionToken) return

    const wsBase = WS_URL || window.location.origin.replace(/^http/, 'ws')
    const url = `${wsBase}/ws/${sessionId}?token=${sessionToken}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setWsReady(true)
      reconnectAttemptsRef.current = 0
      setConnected(true)
    }

    ws.onclose = () => {
      setWsReady(false)
      setConnected(false)
      // Exponential backoff reconnect
      const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000)
      reconnectAttemptsRef.current++
      reconnectTimerRef.current = window.setTimeout(connectWS, delay)
    }

    ws.onerror = () => ws.close()

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        handleWSMessage(msg)
      } catch { /* ignore parse errors */ }
    }
  }, [sessionId, sessionToken])

  const sendWS = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  // ── WebRTC ─────────────────────────────────────────────────────────────────
  const createPeerConnection = useCallback((targetParticipantId: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    peerConnectionRef.current = pc

    // Add local tracks
    localStreamRef.current?.getTracks().forEach((track) => {
      if (localStreamRef.current) pc.addTrack(track, localStreamRef.current)
    })

    // ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendWS({ type: 'ice_candidate', target: targetParticipantId, candidate })
      }
    }

    // Remote stream
    pc.ontrack = ({ streams }) => {
      if (streams[0] && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = streams[0]
      }
    }

    // Connection state
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setConnected(true)
      if (pc.connectionState === 'failed') {
        pc.restartIce()
      }
    }

    // Track stats for ABR
    const statsInterval = setInterval(async () => {
      if (pc.connectionState !== 'connected') return
      try {
        const stats = await pc.getStats()
        stats.forEach((report) => {
          if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
            const bps = report.bytesSent
            setBitrate(Math.round((bps * 8) / 1000))
          }
        })
      } catch { /* ignore */ }
    }, 2000)

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'closed') clearInterval(statsInterval)
    }

    return pc
  }, [sendWS, setBitrate, setConnected])

  const handleWSMessage = useCallback(async (msg: any) => {
    switch (msg.type) {
      case 'session_state':
        Object.entries(msg.participants || {}).forEach(([id, info]) => {
          addParticipant(id, info)
        })
        break

      case 'participant_connected': {
        addParticipant(msg.participant_id, { role: msg.role })
        // If we are agent and a customer connected, create offer
        const store = useCallStore.getState()
        if (store.isAgent && msg.role === 'customer' && participantId) {
          const pc = createPeerConnection(msg.participant_id)
          try {
            const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
            await pc.setLocalDescription(offer)
            sendWS({ type: 'offer', target: msg.participant_id, sdp: offer })
          } catch (e) {
            console.error('Create offer failed', e)
          }
        }
        break
      }

      case 'participant_disconnected':
        removeParticipant(msg.participant_id)
        break

      case 'offer': {
        const pc = createPeerConnection(msg.from)
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          sendWS({ type: 'answer', target: msg.from, sdp: answer })
        } catch (e) {
          console.error('Handle offer failed', e)
        }
        break
      }

      case 'answer':
        try {
          await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(msg.sdp))
        } catch (e) {
          console.error('Handle answer failed', e)
        }
        break

      case 'ice_candidate':
        try {
          await peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(msg.candidate))
        } catch { /* ignore */ }
        break

      case 'chat':
        addMessage({
          id: Date.now().toString(),
          from: msg.from,
          role: msg.role,
          text: msg.text,
          file_id: msg.file_id,
          ts: new Date().toISOString(),
        })
        break

      case 'bitrate_recommendation':
        setBitrate(msg.recommended_kbps)
        break

      case 'recording_started':
        useCallStore.getState().setRecording(true)
        break

      case 'recording_stopped':
        useCallStore.getState().setRecording(false)
        break

      default:
        break
    }
  }, [addParticipant, removeParticipant, addMessage, createPeerConnection, sendWS, setBitrate, participantId])

  // ── Media ──────────────────────────────────────────────────────────────────
  const startLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      return stream
    } catch (e) {
      console.error('getUserMedia failed', e)
      return null
    }
  }, [])

  const startScreenShare = useCallback(async () => {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      const videoTrack = screen.getVideoTracks()[0]

      // Replace video track in peer connection
      const sender = peerConnectionRef.current?.getSenders().find((s) => s.track?.kind === 'video')
      if (sender) await sender.replaceTrack(videoTrack)

      videoTrack.onended = () => stopScreenShare()
      sendWS({ type: 'screen_share_start' })
      useCallStore.getState().setScreenSharing(true)
    } catch { /* User cancelled */ }
  }, [sendWS])

  const stopScreenShare = useCallback(async () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0]
    const sender = peerConnectionRef.current?.getSenders().find((s) => s.track?.kind === 'video')
    if (sender && videoTrack) await sender.replaceTrack(videoTrack)
    sendWS({ type: 'screen_share_stop' })
    useCallStore.getState().setScreenSharing(false)
  }, [sendWS])

  // ── Mute / Video toggle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!localStreamRef.current) return
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !isMuted))
    sendWS({ type: isMuted ? 'mute_audio' : 'unmute_audio' })
  }, [isMuted, sendWS])

  useEffect(() => {
    if (!localStreamRef.current) return
    localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = !isVideoOff))
    sendWS({ type: isVideoOff ? 'mute_video' : 'unmute_video' })
  }, [isVideoOff, sendWS])

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId || !sessionToken) return

    const init = async () => {
      await startLocalStream()
      connectWS()
    }
    init()

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
      peerConnectionRef.current?.close()
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [sessionId, sessionToken])

  const sendChat = useCallback((text: string, fileId?: string) => {
    sendWS({ type: 'chat', text, file_id: fileId })
    addMessage({
      id: Date.now().toString(),
      from: participantId,
      role: useCallStore.getState().isAgent ? 'agent' : 'customer',
      text,
      file_id: fileId,
      ts: new Date().toISOString(),
      isSelf: true,
    })
  }, [sendWS, participantId, addMessage])

  const sendPing = useCallback(() => sendWS({ type: 'ping' }), [sendWS])

  return {
    localVideoRef,
    remoteVideoRef,
    wsReady,
    sendChat,
    sendPing,
    startScreenShare,
    stopScreenShare,
  }
}
