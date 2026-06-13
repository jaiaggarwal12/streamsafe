"""
WebSocket connection manager for real-time session communication.
Handles signaling, chat, media state, and participant events.
"""
import json
import asyncio
from typing import Dict, Set, Optional
from fastapi import WebSocket
import structlog

logger = structlog.get_logger()


class ConnectionManager:
    """Manages active WebSocket connections per session."""

    def __init__(self):
        # session_id -> {participant_id -> WebSocket}
        self.active: Dict[str, Dict[str, WebSocket]] = {}
        # participant_id -> session_id (reverse lookup)
        self.participant_session: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, session_id: str, participant_id: str):
        await websocket.accept()

        if session_id not in self.active:
            self.active[session_id] = {}

        self.active[session_id][participant_id] = websocket
        self.participant_session[participant_id] = session_id

        logger.info(
            "ws_connected",
            session_id=session_id,
            participant_id=participant_id,
            total_in_session=len(self.active[session_id]),
        )

    def disconnect(self, session_id: str, participant_id: str):
        if session_id in self.active:
            self.active[session_id].pop(participant_id, None)
            if not self.active[session_id]:
                del self.active[session_id]

        self.participant_session.pop(participant_id, None)

        logger.info(
            "ws_disconnected",
            session_id=session_id,
            participant_id=participant_id,
        )

    async def send_to(self, participant_id: str, message: dict):
        """Send message to a specific participant."""
        session_id = self.participant_session.get(participant_id)
        if not session_id:
            return

        ws = self.active.get(session_id, {}).get(participant_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception as e:
                logger.warning("ws_send_failed", participant_id=participant_id, error=str(e))

    async def broadcast_session(
        self,
        session_id: str,
        message: dict,
        exclude: Optional[str] = None,
    ):
        """Broadcast to all participants in a session."""
        session_conns = self.active.get(session_id, {})
        dead = []

        for pid, ws in session_conns.items():
            if pid == exclude:
                continue
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(pid)

        for pid in dead:
            self.disconnect(session_id, pid)

    def get_participant_count(self, session_id: str) -> int:
        return len(self.active.get(session_id, {}))

    def get_session_participants(self, session_id: str) -> Set[str]:
        return set(self.active.get(session_id, {}).keys())

    def is_connected(self, session_id: str, participant_id: str) -> bool:
        return participant_id in self.active.get(session_id, {})


# Singleton manager
ws_manager = ConnectionManager()
