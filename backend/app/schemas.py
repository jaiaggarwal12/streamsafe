from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum


class SessionStatus(str, Enum):
    CREATED = "created"
    ACTIVE = "active"
    ENDED = "ended"
    ERROR = "error"


class RecordingStatus(str, Enum):
    NONE = "none"
    RECORDING = "recording"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class UserRole(str, Enum):
    AGENT = "agent"
    CUSTOMER = "customer"
    ADMIN = "admin"


# ─── Auth ─────────────────────────────────────────────────────────────────────

class AgentRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)
    team: Optional[str] = None


class AgentLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    agent: "AgentOut"


class AgentOut(BaseModel):
    id: str
    name: str
    email: str
    team: Optional[str]
    role: UserRole
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Session ──────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)


class SessionOut(BaseModel):
    id: str
    agent_id: str
    title: Optional[str]
    status: SessionStatus
    recording_status: RecordingStatus
    created_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    issue_resolved: Optional[bool]
    invite_token: Optional[str] = None
    invite_url: Optional[str] = None
    participant_count: Optional[int] = 0

    class Config:
        from_attributes = True


class SessionUpdate(BaseModel):
    issue_resolved: Optional[bool] = None
    title: Optional[str] = None


class SessionEndRequest(BaseModel):
    issue_resolved: Optional[bool] = None


# ─── Participant ──────────────────────────────────────────────────────────────

class ParticipantOut(BaseModel):
    id: str
    session_id: str
    user_id: str
    user_role: UserRole
    display_name: Optional[str]
    joined_at: datetime
    left_at: Optional[datetime]
    duration_seconds: Optional[int]
    disconnect_count: int
    final_codec: Optional[str]
    device_type: Optional[str]
    browser: Optional[str]

    class Config:
        from_attributes = True


class JoinSessionRequest(BaseModel):
    invite_token: str
    display_name: Optional[str] = Field(None, max_length=100)
    device_type: Optional[str] = None
    browser: Optional[str] = None


class JoinSessionResponse(BaseModel):
    participant_id: str
    session_id: str
    session_token: str
    ice_servers: List[dict]
    participants: List[ParticipantOut]


# ─── Chat ─────────────────────────────────────────────────────────────────────

class ChatMessageCreate(BaseModel):
    message_text: Optional[str] = Field(None, max_length=4000)
    file_id: Optional[str] = None


class ChatMessageOut(BaseModel):
    id: str
    session_id: str
    sender_id: str
    sender_name: Optional[str]
    sender_role: UserRole
    message_text: Optional[str]
    file_id: Optional[str]
    created_at: datetime
    is_system: bool

    class Config:
        from_attributes = True


# ─── File ─────────────────────────────────────────────────────────────────────

class FileOut(BaseModel):
    id: str
    session_id: str
    uploaded_by: str
    filename: str
    size_bytes: Optional[int]
    mime_type: Optional[str]
    uploaded_at: datetime
    download_url: Optional[str]

    class Config:
        from_attributes = True


# ─── Recording ────────────────────────────────────────────────────────────────

class RecordingOut(BaseModel):
    id: str
    session_id: str
    status: RecordingStatus
    file_size_bytes: Optional[int]
    duration_seconds: Optional[int]
    created_at: datetime
    completed_at: Optional[datetime]
    expires_at: Optional[datetime]
    download_url: Optional[str] = None

    class Config:
        from_attributes = True


# ─── ABR / Network Stats ─────────────────────────────────────────────────────

class NetworkStats(BaseModel):
    bandwidth_kbps: int
    packet_loss_ratio: float = Field(..., ge=0.0, le=1.0)
    rtt_ms: float
    jitter_ms: float
    content_type: str = "face"  # face | document | screenshare
    device_type: str = "desktop"
    browser: str = "chrome"
    network_type: str = "wifi"


class ABRRecommendation(BaseModel):
    recommended_bitrate_kbps: int
    confidence: float
    model_used: str
    trigger: str


# ─── Analytics ────────────────────────────────────────────────────────────────

class AgentStats(BaseModel):
    agent_id: str
    agent_name: str
    total_calls: int
    resolved_calls: int
    resolution_rate: float
    avg_duration_seconds: float
    avg_call_duration_formatted: str


class SystemStats(BaseModel):
    active_sessions: int
    total_sessions_today: int
    total_agents: int
    avg_join_latency_ms: float
    error_rate: float
    resolution_rate: float


# ─── WebSocket Messages ───────────────────────────────────────────────────────

class WSMessage(BaseModel):
    type: str
    data: dict = {}
    session_id: Optional[str] = None
    participant_id: Optional[str] = None
