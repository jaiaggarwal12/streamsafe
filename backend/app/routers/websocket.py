"""
WebSocket router — handles real-time signaling, chat relay, media state.
"""
import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt, JWTError

from app.config import settings
from app.websocket_manager import ws_manager
from app.redis_client import SessionCache, RateLimiter
import structlog

logger = structlog.get_logger()
router = APIRouter(tags=["websocket"])


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return {}


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    token: str = Query(...),
):
    payload = _decode_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    participant_id = payload.get("sub")
    role = payload.get("role", "customer")

    if not participant_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await ws_manager.connect(websocket, session_id, participant_id)

    # Notify others
    await ws_manager.broadcast_session(session_id, {
        "type": "participant_connected",
        "participant_id": participant_id,
        "role": role,
    }, exclude=participant_id)

    # Send existing participants to new connection
    participants = await SessionCache.get_participants(session_id)
    await ws_manager.send_to(participant_id, {
        "type": "session_state",
        "participants": participants,
        "session_id": session_id,
    })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type", "")

            # ── WebRTC Signaling ─────────────────────────────────────────
            if msg_type == "offer":
                target = msg.get("target")
                if target:
                    await ws_manager.send_to(target, {
                        "type": "offer",
                        "from": participant_id,
                        "sdp": msg.get("sdp"),
                    })

            elif msg_type == "answer":
                target = msg.get("target")
                if target:
                    await ws_manager.send_to(target, {
                        "type": "answer",
                        "from": participant_id,
                        "sdp": msg.get("sdp"),
                    })

            elif msg_type == "ice_candidate":
                target = msg.get("target")
                if target:
                    await ws_manager.send_to(target, {
                        "type": "ice_candidate",
                        "from": participant_id,
                        "candidate": msg.get("candidate"),
                    })

            # ── Chat ─────────────────────────────────────────────────────
            elif msg_type == "chat":
                if not await RateLimiter.check_chat_rate(participant_id):
                    await ws_manager.send_to(participant_id, {
                        "type": "error",
                        "message": "Rate limit exceeded",
                    })
                    continue

                await ws_manager.broadcast_session(session_id, {
                    "type": "chat",
                    "from": participant_id,
                    "role": role,
                    "text": msg.get("text", ""),
                    "file_id": msg.get("file_id"),
                })

            # ── Media State ───────────────────────────────────────────────
            elif msg_type in ("mute_audio", "unmute_audio", "mute_video", "unmute_video"):
                await ws_manager.broadcast_session(session_id, {
                    "type": msg_type,
                    "participant_id": participant_id,
                }, exclude=participant_id)

            elif msg_type == "screen_share_start":
                await ws_manager.broadcast_session(session_id, {
                    "type": "screen_share_start",
                    "participant_id": participant_id,
                }, exclude=participant_id)

            elif msg_type == "screen_share_stop":
                await ws_manager.broadcast_session(session_id, {
                    "type": "screen_share_stop",
                    "participant_id": participant_id,
                }, exclude=participant_id)

            # ── Ping / Heartbeat ─────────────────────────────────────────
            elif msg_type == "ping":
                await ws_manager.send_to(participant_id, {"type": "pong"})

            # ── Network Stats (for ABR) ───────────────────────────────────
            elif msg_type == "network_stats":
                stats = msg.get("stats", {})
                # Could trigger ABR recalc here and push recommendation
                await ws_manager.send_to(participant_id, {
                    "type": "bitrate_recommendation",
                    "recommended_kbps": _simple_abr(stats),
                })

            else:
                # Forward unknown types to session (extensible)
                await ws_manager.broadcast_session(session_id, {
                    **msg,
                    "from": participant_id,
                }, exclude=participant_id)

    except WebSocketDisconnect:
        ws_manager.disconnect(session_id, participant_id)
        await ws_manager.broadcast_session(session_id, {
            "type": "participant_disconnected",
            "participant_id": participant_id,
            "role": role,
        })
        logger.info("ws_participant_left", session_id=session_id, participant_id=participant_id)


def _simple_abr(stats: dict) -> int:
    """Quick inline ABR for WS path (full ABR engine available via REST)."""
    bw = stats.get("bandwidth_kbps", 1500)
    loss = stats.get("packet_loss_ratio", 0)
    if loss > 0.05:
        return 500
    if bw < 800:
        return 500
    if bw < 1500:
        return 1200
    if bw < 3000:
        return 2000
    return 3000
