from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List
import uuid, os, mimetypes

from app.database import get_db
from app.models import ChatMessage, Session, SessionFile, UserRole, SessionStatus, Agent
from app.schemas import ChatMessageCreate, ChatMessageOut, FileOut
from app.auth import get_current_agent
from app.redis_client import SessionCache, RateLimiter
from app.config import settings
import structlog

logger = structlog.get_logger()
router = APIRouter(prefix="/sessions/{session_id}/chat", tags=["chat"])


async def _verify_session(session_id: str, db: AsyncSession) -> Session:
    result = await db.execute(select(Session).where(Session.id == session_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@router.get("", response_model=List[ChatMessageOut])
async def get_chat_history(
    session_id: str,
    limit: int = 100,
    offset: int = 0,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    await _verify_session(session_id, db)
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
        .limit(limit)
        .offset(offset)
    )
    return [ChatMessageOut.model_validate(m) for m in result.scalars().all()]


@router.post("", response_model=ChatMessageOut, status_code=201)
async def send_message(
    session_id: str,
    payload: ChatMessageCreate,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    session = await _verify_session(session_id, db)
    if session.agent_id != agent.id:
        raise HTTPException(403, "Not your session")

    if not await RateLimiter.check_chat_rate(agent.id):
        raise HTTPException(429, "Rate limit exceeded")

    msg = ChatMessage(
        session_id=session_id,
        sender_id=agent.id,
        sender_name=agent.name,
        sender_role=UserRole.AGENT,
        message_text=payload.message_text,
        file_id=payload.file_id,
    )
    db.add(msg)
    await db.flush()

    await SessionCache.publish(session_id, {
        "type": "chat_message",
        "id": msg.id,
        "sender_id": agent.id,
        "sender_name": agent.name,
        "sender_role": "agent",
        "message_text": payload.message_text,
        "file_id": payload.file_id,
        "created_at": msg.created_at.isoformat(),
    })

    return ChatMessageOut.model_validate(msg)


@router.post("/upload", response_model=FileOut, status_code=201)
async def upload_file(
    session_id: str,
    file: UploadFile = File(...),
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    session = await _verify_session(session_id, db)
    if session.agent_id != agent.id:
        raise HTTPException(403, "Not your session")

    MAX_SIZE = 50 * 1024 * 1024  # 50 MB
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "File too large (max 50MB)")

    file_id = str(uuid.uuid4())
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"

    # Try S3 upload
    s3_key = None
    download_url = None

    if settings.AWS_ACCESS_KEY_ID:
        try:
            import boto3
            s3 = boto3.client(
                "s3",
                region_name=settings.S3_REGION,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                endpoint_url=settings.S3_ENDPOINT_URL or None,
            )
            s3_key = f"files/{session_id}/{file_id}/{file.filename}"
            s3.put_object(
                Bucket=settings.S3_BUCKET_NAME,
                Key=s3_key,
                Body=content,
                ContentType=mime,
            )
            download_url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.S3_BUCKET_NAME, "Key": s3_key},
                ExpiresIn=86400,
            )
        except Exception as e:
            logger.warning("s3_upload_failed", error=str(e))

    session_file = SessionFile(
        id=file_id,
        session_id=session_id,
        uploaded_by=agent.id,
        filename=file.filename or "file",
        s3_key=s3_key,
        size_bytes=len(content),
        mime_type=mime,
        download_url=download_url,
    )
    db.add(session_file)

    return FileOut.model_validate(session_file)
