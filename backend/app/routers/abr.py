from fastapi import APIRouter, Depends, HTTPException
from app.schemas import NetworkStats, ABRRecommendation
from app.abr import abr_engine, NetworkSample
from app.auth import get_current_agent
from app.models import Agent
import time

router = APIRouter(prefix="/abr", tags=["abr"])


@router.post("/recommend", response_model=ABRRecommendation)
async def get_abr_recommendation(
    payload: NetworkStats,
    participant_id: str,
    actual_throughput_kbps: int = None,
    call_duration_s: float = 0.0,
    agent: Agent = Depends(get_current_agent),
):
    sample = NetworkSample(
        bandwidth_kbps=payload.bandwidth_kbps,
        packet_loss_ratio=payload.packet_loss_ratio,
        rtt_ms=payload.rtt_ms,
        jitter_ms=payload.jitter_ms,
        timestamp=time.time(),
    )

    result = abr_engine.recommend(
        participant_id=participant_id,
        stats=sample,
        actual_throughput_kbps=actual_throughput_kbps,
        content_type=payload.content_type,
        device_type=payload.device_type,
        browser=payload.browser,
        network_type=payload.network_type,
        call_duration_s=call_duration_s,
        current_ts=time.time(),
    )

    return ABRRecommendation(
        recommended_bitrate_kbps=result["recommended_bitrate_kbps"],
        confidence=result["confidence"],
        model_used=result["model_used"],
        trigger=result["trigger"],
    )
