from sqlalchemy import (
    Column, String, Integer, BigInteger, Boolean, Float,
    DateTime, Text, Enum, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
import uuid
import enum

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


def new_uuid():
    return str(uuid.uuid4())


class SessionStatus(str, enum.Enum):
    CREATED = "created"
    ACTIVE = "active"
    ENDED = "ended"
    ERROR = "error"


class RecordingStatus(str, enum.Enum):
    NONE = "none"
    RECORDING = "recording"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class UserRole(str, enum.Enum):
    AGENT = "agent"
    CUSTOMER = "customer"
    ADMIN = "admin"


class Agent(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    team = Column(String(100), nullable=True)
    role = Column(Enum(UserRole), default=UserRole.AGENT)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    last_login = Column(DateTime(timezone=True), nullable=True)

    sessions = relationship("Session", back_populates="agent")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=new_uuid)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False, index=True)
    title = Column(String(255), nullable=True)
    status = Column(Enum(SessionStatus), default=SessionStatus.CREATED, index=True)
    recording_status = Column(Enum(RecordingStatus), default=RecordingStatus.NONE)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    customer_device_type = Column(String(50), nullable=True)
    issue_resolved = Column(Boolean, nullable=True)
    customer_token = Column(String(255), nullable=True, unique=True)
    invite_expires_at = Column(DateTime(timezone=True), nullable=True)

    agent = relationship("Agent", back_populates="sessions")
    participants = relationship("Participant", back_populates="session", cascade="all, delete-orphan")
    chat_messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
    recording = relationship("Recording", back_populates="session", uselist=False, cascade="all, delete-orphan")
    files = relationship("SessionFile", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_sessions_agent_created", "agent_id", "created_at"),
    )


class Participant(Base):
    __tablename__ = "participants"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    user_id = Column(String, nullable=False)
    user_role = Column(Enum(UserRole), nullable=False)
    display_name = Column(String(100), nullable=True)
    joined_at = Column(DateTime(timezone=True), default=utcnow)
    left_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    disconnect_count = Column(Integer, default=0)
    final_codec = Column(String(50), nullable=True)
    device_type = Column(String(50), nullable=True)
    browser = Column(String(50), nullable=True)
    network_type = Column(String(20), nullable=True)

    session = relationship("Session", back_populates="participants")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    sender_id = Column(String, nullable=False)
    sender_name = Column(String(100), nullable=True)
    sender_role = Column(Enum(UserRole), nullable=False)
    message_text = Column(Text, nullable=True)
    file_id = Column(String, ForeignKey("session_files.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    is_system = Column(Boolean, default=False)

    session = relationship("Session", back_populates="chat_messages")
    file = relationship("SessionFile", foreign_keys=[file_id])


class SessionFile(Base):
    __tablename__ = "session_files"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    uploaded_by = Column(String, nullable=False)
    filename = Column(String(255), nullable=False)
    s3_key = Column(String(512), nullable=True)
    size_bytes = Column(BigInteger, nullable=True)
    mime_type = Column(String(100), nullable=True)
    uploaded_at = Column(DateTime(timezone=True), default=utcnow)
    download_url = Column(Text, nullable=True)

    session = relationship("Session", back_populates="files")


class Recording(Base):
    __tablename__ = "recordings"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, unique=True)
    s3_url = Column(String(512), nullable=True)
    s3_key = Column(String(512), nullable=True)
    status = Column(Enum(RecordingStatus), default=RecordingStatus.PROCESSING)
    error_message = Column(Text, nullable=True)
    file_size_bytes = Column(BigInteger, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    session = relationship("Session", back_populates="recording")


class BitrateEvent(Base):
    __tablename__ = "bitrate_events"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    participant_id = Column(String, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=utcnow)
    old_bitrate_kbps = Column(Integer, nullable=True)
    new_bitrate_kbps = Column(Integer, nullable=False)
    trigger_reason = Column(String(50), nullable=True)
    packet_loss_ratio = Column(Float, nullable=True)
    rtt_ms = Column(Float, nullable=True)
    jitter_ms = Column(Float, nullable=True)
    bandwidth_kbps = Column(Integer, nullable=True)