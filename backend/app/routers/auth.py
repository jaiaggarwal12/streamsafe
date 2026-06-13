from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.database import get_db
from app.models import Agent, UserRole
from app.schemas import AgentRegister, AgentLogin, Token, AgentOut
from app.auth import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=201)
async def register(payload: AgentRegister, db: AsyncSession = Depends(get_db)):
    # Check duplicate email
    result = await db.execute(select(Agent).where(Agent.email == payload.email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    agent = Agent(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        team=payload.team,
        role=UserRole.AGENT,
    )
    db.add(agent)
    await db.flush()

    token = create_access_token({"sub": agent.id})
    return Token(
        access_token=token,
        token_type="bearer",
        agent=AgentOut.model_validate(agent),
    )


@router.post("/login", response_model=Token)
async def login(payload: AgentLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.email == payload.email))
    agent = result.scalar_one_or_none()

    if not agent or not verify_password(payload.password, agent.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not agent.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    agent.last_login = datetime.now(timezone.utc)

    token = create_access_token({"sub": agent.id})
    return Token(
        access_token=token,
        token_type="bearer",
        agent=AgentOut.model_validate(agent),
    )


@router.get("/me", response_model=AgentOut)
async def me(agent: Agent = Depends(__import__("app.auth", fromlist=["get_current_agent"]).get_current_agent)):
    return AgentOut.model_validate(agent)
