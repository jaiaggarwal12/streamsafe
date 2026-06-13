from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from app.database import get_db
from app.models import Agent, Session, Participant, UserRole, SessionStatus, RecordingStatus, Recording
from app.schemas import (
    SessionCreate, SessionOut, SessionUpdate, SessionEndRequest,
    ParticipantOut, JoinSessionRequest, JoinSessionResponse, RecordingOut,
)
from app.auth import get_current_agent, create_invite_token, verify_invite_token, create_access_token
from app.redis_client import SessionCache
from app.config import settings
import structlog

logger = structlog.get_logger()
router = APIRouter(prefix="/sessions", tags=["sessions"])


def _ice_servers():
    servers = [{"urls": settings.STUN_SERVER}]
    if settings.TURN_SERVER:
        servers.append({
            "urls": settings.TURN_SERVER,
            "username": settings.TURN_USERNAME,
            "credential": settings.TURN_CREDENTIAL,
        })
    return servers


@router.post("", response_model=SessionOut, status_code=201)
async def create_session(
    payload: SessionCreate,
    request: Request,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    session = Session(
        agent_id=agent.id,
        title=payload.title or f"Support Call - {agent.name}",
        status=SessionStatus.CREATED,
    )
    db.add(session)
    await db.flush()

    # Generate invite token
    token = create_invite_token(session.id)
    session.customer_token = token
    session.invite_expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.INVITE_TOKEN_EXPIRE_MINUTES
    )

    await SessionCache.set_state(session.id, {
        "status": "created",
        "agent_id": agent.id,
        "created_at": session.created_at.isoformat(),
    })
    await SessionCache.set_invite_token(session.id, token)

    base_url = str(request.base_url).rstrip("/")
    invite_url = f"{base_url}/join?token={token}"

    out = SessionOut.model_validate(session)
    out.invite_token = token
    out.invite_url = invite_url
    out.participant_count = 0

    logger.info("session_created", session_id=session.id, agent_id=agent.id)
    return out


@router.get("", response_model=List[SessionOut])
async def list_sessions(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    q = select(Session).where(Session.agent_id == agent.id)
    if status:
        q = q.where(Session.status == status)
    q = q.order_by(desc(Session.created_at)).limit(limit).offset(offset)
    result = await db.execute(q)
    sessions = result.scalars().all()
    return [SessionOut.model_validate(s) for s in sessions]


@router.get("/{session_id}", response_model=SessionOut)
async def get_session(
    session_id: str,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.agent_id == agent.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    participants = await SessionCache.get_participants(session_id)

    base_token = create_invite_token(session_id) if session.status != SessionStatus.ENDED else None
    out = SessionOut.model_validate(session)
    out.invite_token = base_token
    out.participant_count = len(participants)
    return out


@router.post("/{session_id}/end", response_model=SessionOut)
async def end_session(
    session_id: str,
    payload: SessionEndRequest,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.agent_id == agent.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == SessionStatus.ENDED:
        return SessionOut.model_validate(session)

    now = datetime.now(timezone.utc)
    session.status = SessionStatus.ENDED
    session.ended_at = now
    if session.created_at:
        delta = now - session.created_at.replace(tzinfo=timezone.utc) if session.created_at.tzinfo is None else now - session.created_at
        session.duration_seconds = int(delta.total_seconds())

    if payload.issue_resolved is not None:
        session.issue_resolved = payload.issue_resolved

    await SessionCache.delete_state(session_id)
    logger.info("session_ended", session_id=session_id, resolved=payload.issue_resolved)

    return SessionOut.model_validate(session)


@router.post("/{session_id}/start-recording", response_model=dict)
async def start_recording(
    session_id: str,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.agent_id == agent.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    if session.status != SessionStatus.ACTIVE:
        raise HTTPException(400, "Session must be active to record")

    session.recording_status = RecordingStatus.RECORDING
    await SessionCache.publish(session_id, {"type": "recording_started", "session_id": session_id})
    return {"status": "recording", "session_id": session_id}


@router.post("/{session_id}/stop-recording", response_model=dict)
async def stop_recording(
    session_id: str,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.agent_id == agent.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    session.recording_status = RecordingStatus.PROCESSING

    # Create recording record
    rec = Recording(
        session_id=session_id,
        status=RecordingStatus.PROCESSING,
        created_at=datetime.now(timezone.utc),
    )
    db.add(rec)
    await db.flush()

    await SessionCache.publish(session_id, {"type": "recording_stopped", "session_id": session_id})
    return {"status": "processing", "recording_id": rec.id}


@router.get("/{session_id}/recording", response_model=Optional[RecordingOut])
async def get_recording(
    session_id: str,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Recording).where(Recording.session_id == session_id)
    )
    recording = result.scalar_one_or_none()
    if not recording:
        return None
    return RecordingOut.model_validate(recording)


@router.post("/join", response_model=JoinSessionResponse)
async def join_session(
    payload: JoinSessionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Customer joins a session via invite token — no auth required."""
    token_data = verify_invite_token(payload.invite_token)
    session_id = token_data["session_id"]

    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    if session.status == SessionStatus.ENDED:
        raise HTTPException(400, "Session has ended")

    from app.models import new_uuid
    participant_id = new_uuid()

    participant = Participant(
        id=participant_id,
        session_id=session_id,
        user_id=f"customer-{participant_id[:8]}",
        user_role=UserRole.CUSTOMER,
        display_name=payload.display_name or "Customer",
        device_type=payload.device_type,
        browser=payload.browser,
    )
    db.add(participant)

    if session.status == SessionStatus.CREATED:
        session.status = SessionStatus.ACTIVE

    await SessionCache.add_participant(session_id, participant_id, {
        "role": "customer",
        "display_name": payload.display_name or "Customer",
        "joined_at": datetime.now(timezone.utc).isoformat(),
    })
    await SessionCache.publish(session_id, {
        "type": "participant_joined",
        "participant_id": participant_id,
        "role": "customer",
        "display_name": payload.display_name or "Customer",
    })

    session_token = create_access_token(
        {"sub": participant_id, "session_id": session_id, "role": "customer"}
    )

    # Get existing participants
    p_result = await db.execute(
        select(Participant).where(Participant.session_id == session_id, Participant.left_at == None)
    )
    participants = p_result.scalars().all()

    return JoinSessionResponse(
        participant_id=participant_id,
        session_id=session_id,
        session_token=session_token,
        ice_servers=_ice_servers(),
        participants=[ParticipantOut.model_validate(p) for p in participants],
    )


@router.post("/{session_id}/agent-join", response_model=JoinSessionResponse)
async def agent_join_session(
    session_id: str,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    """Agent joins their own session."""
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.agent_id == agent.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    from app.models import new_uuid
    participant_id = new_uuid()

    participant = Participant(
        id=participant_id,
        session_id=session_id,
        user_id=agent.id,
        user_role=UserRole.AGENT,
        display_name=agent.name,
    )
    db.add(participant)

    if session.status == SessionStatus.CREATED:
        session.status = SessionStatus.ACTIVE

    await SessionCache.add_participant(session_id, participant_id, {
        "role": "agent",
        "display_name": agent.name,
        "joined_at": datetime.now(timezone.utc).isoformat(),
    })
    await SessionCache.publish(session_id, {
        "type": "participant_joined",
        "participant_id": participant_id,
        "role": "agent",
        "display_name": agent.name,
    })

    session_token = create_access_token(
        {"sub": participant_id, "session_id": session_id, "role": "agent", "agent_id": agent.id}
    )

    p_result = await db.execute(
        select(Participant).where(Participant.session_id == session_id, Participant.left_at == None)
    )
    participants = p_result.scalars().all()

    return JoinSessionResponse(
        participant_id=participant_id,
        session_id=session_id,
        session_token=session_token,
        ice_servers=_ice_servers(),
        participants=[ParticipantOut.model_validate(p) for p in participants],
    )
