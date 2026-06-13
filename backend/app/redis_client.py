import json
import redis.asyncio as aioredis
from typing import Optional, Any
from app.config import settings

_redis: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=5,
            retry_on_timeout=True,
        )
    return _redis


async def close_redis():
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


class SessionCache:
    """Redis-backed session state cache."""

    PREFIX = "session"

    @classmethod
    async def set_state(cls, session_id: str, state: dict, ttl: int = 7200):
        r = await get_redis()
        key = f"{cls.PREFIX}:{session_id}:state"
        await r.set(key, json.dumps(state), ex=ttl)

    @classmethod
    async def get_state(cls, session_id: str) -> Optional[dict]:
        r = await get_redis()
        key = f"{cls.PREFIX}:{session_id}:state"
        val = await r.get(key)
        return json.loads(val) if val else None

    @classmethod
    async def delete_state(cls, session_id: str):
        r = await get_redis()
        key = f"{cls.PREFIX}:{session_id}:state"
        await r.delete(key)

    @classmethod
    async def add_participant(cls, session_id: str, participant_id: str, info: dict):
        r = await get_redis()
        key = f"{cls.PREFIX}:{session_id}:participants"
        await r.hset(key, participant_id, json.dumps(info))
        await r.expire(key, 7200)

    @classmethod
    async def remove_participant(cls, session_id: str, participant_id: str):
        r = await get_redis()
        key = f"{cls.PREFIX}:{session_id}:participants"
        await r.hdel(key, participant_id)

    @classmethod
    async def get_participants(cls, session_id: str) -> dict:
        r = await get_redis()
        key = f"{cls.PREFIX}:{session_id}:participants"
        raw = await r.hgetall(key)
        return {k: json.loads(v) for k, v in raw.items()}

    @classmethod
    async def set_invite_token(cls, session_id: str, token: str, ttl: int = 1800):
        r = await get_redis()
        key = f"{cls.PREFIX}:{session_id}:invite_token"
        await r.set(key, token, ex=ttl)

    @classmethod
    async def get_invite_token(cls, session_id: str) -> Optional[str]:
        r = await get_redis()
        key = f"{cls.PREFIX}:{session_id}:invite_token"
        return await r.get(key)

    @classmethod
    async def publish(cls, session_id: str, message: dict):
        r = await get_redis()
        channel = f"{cls.PREFIX}:{session_id}:events"
        await r.publish(channel, json.dumps(message))

    @classmethod
    async def subscribe(cls, session_id: str):
        r = await get_redis()
        pubsub = r.pubsub()
        channel = f"{cls.PREFIX}:{session_id}:events"
        await pubsub.subscribe(channel)
        return pubsub


class RateLimiter:
    """Token bucket rate limiter in Redis."""

    @classmethod
    async def is_allowed(
        cls,
        key: str,
        capacity: int = 100,
        refill_rate: int = 10,
    ) -> bool:
        r = await get_redis()
        bucket_key = f"rate_limit:{key}"

        tokens = await r.get(bucket_key)
        if tokens is None:
            await r.set(bucket_key, capacity - 1, ex=60)
            return True

        tokens = int(tokens)
        if tokens <= 0:
            return False

        await r.decr(bucket_key)
        return True

    @classmethod
    async def check_chat_rate(cls, participant_id: str) -> bool:
        return await cls.is_allowed(f"chat:{participant_id}", capacity=100, refill_rate=10)
