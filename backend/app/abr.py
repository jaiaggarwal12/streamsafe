"""
Adaptive Bitrate (ABR) Engine
Layer 1: Heuristic baseline
Layer 2: XGBoost ML model (trained on call outcomes)
Layer 3: Reactive feedback loop
"""
import os
import pickle
from typing import Optional
from dataclasses import dataclass, field
from collections import deque
import structlog

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False

logger = structlog.get_logger()

# Bitrate tiers (kbps)
BITRATE_LOW = 500
BITRATE_MID = 1500
BITRATE_HIGH = 3000
BITRATE_MAX = 4000
BITRATE_MIN = 250


@dataclass
class NetworkSample:
    bandwidth_kbps: int
    packet_loss_ratio: float
    rtt_ms: float
    jitter_ms: float
    timestamp: float = 0.0


@dataclass
class ABRState:
    current_bitrate_kbps: int = BITRATE_MID
    history: deque = field(default_factory=lambda: deque(maxlen=30))
    last_change_ts: float = 0.0
    oscillation_count: int = 0
    consecutive_below: int = 0
    consecutive_above: int = 0


class HeuristicABR:
    """Rule-based ABR — fast, always available."""

    def predict(self, stats: NetworkSample, state: ABRState) -> int:
        if stats.packet_loss_ratio > 0.05:
            return BITRATE_LOW
        if stats.jitter_ms > 80:
            return BITRATE_LOW
        if stats.packet_loss_ratio > 0.02:
            return BITRATE_MID // 2
        if stats.jitter_ms > 50:
            return BITRATE_MID
        if stats.bandwidth_kbps < 800:
            return BITRATE_LOW
        if stats.bandwidth_kbps < 1500:
            return BITRATE_MID
        if stats.bandwidth_kbps < 3000:
            return BITRATE_HIGH
        return BITRATE_MAX


class MLABRModel:
    """XGBoost-based ABR using call outcome as label."""

    def __init__(self, model_path: str = "models/abr_model.pkl"):
        self.model = None
        self.model_path = model_path
        self._load()

    def _load(self):
        if os.path.exists(self.model_path):
            try:
                with open(self.model_path, "rb") as f:
                    self.model = pickle.load(f)
                logger.info("abr_model_loaded", path=self.model_path)
            except Exception as e:
                logger.warning("abr_model_load_failed", error=str(e))
                self.model = None

    def _features(self, stats, content_type, device_type, browser, network_type, call_duration_s):
        if not NUMPY_AVAILABLE:
            return None
        content_map = {"face": 0, "document": 1, "screenshare": 2}
        device_map = {"desktop": 0, "mobile": 1, "tablet": 2}
        browser_map = {"chrome": 0, "firefox": 1, "safari": 2, "edge": 3}
        network_map = {"wifi": 0, "4g": 1, "3g": 2, "ethernet": 3}
        return np.array([[
            stats.bandwidth_kbps, stats.packet_loss_ratio, stats.rtt_ms, stats.jitter_ms,
            content_map.get(content_type, 0), device_map.get(device_type, 0),
            browser_map.get(browser, 0), network_map.get(network_type, 0),
            call_duration_s, min(call_duration_s / 60.0, 60.0),
        ]])

    def predict(self, stats, content_type="face", device_type="desktop",
                browser="chrome", network_type="wifi", call_duration_s=0.0):
        if self.model is None or not NUMPY_AVAILABLE:
            return None
        try:
            X = self._features(stats, content_type, device_type, browser, network_type, call_duration_s)
            if X is None:
                return None
            pred = self.model.predict(X)[0]
            tier_map = {0: BITRATE_LOW, 1: BITRATE_MID, 2: BITRATE_HIGH, 3: BITRATE_MAX}
            return tier_map.get(int(pred), BITRATE_MID)
        except Exception as e:
            logger.warning("ml_abr_predict_failed", error=str(e))
            return None


class ReactiveABR:
    """Feedback loop that adjusts prediction based on actual throughput."""

    HYSTERESIS_DOWN = 0.80
    HYSTERESIS_UP = 1.20
    MAX_CHANGE_RATIO = 0.15
    MIN_INTERVAL_S = 2.0

    def adjust(
        self,
        predicted_kbps: int,
        actual_kbps: int,
        state: ABRState,
        current_ts: float,
    ) -> int:
        if current_ts - state.last_change_ts < self.MIN_INTERVAL_S:
            return predicted_kbps  # Too soon, hold

        ratio = actual_kbps / max(predicted_kbps, 1)

        if ratio < self.HYSTERESIS_DOWN:
            state.consecutive_below += 1
            state.consecutive_above = 0
        elif ratio > self.HYSTERESIS_UP:
            state.consecutive_above += 1
            state.consecutive_below = 0
        else:
            state.consecutive_below = 0
            state.consecutive_above = 0

        new_bitrate = predicted_kbps

        if state.consecutive_below >= 2:
            reduction = predicted_kbps * self.MAX_CHANGE_RATIO
            new_bitrate = max(BITRATE_MIN, int(predicted_kbps - reduction))
            state.consecutive_below = 0
            state.last_change_ts = current_ts
            state.oscillation_count += 1

        elif state.consecutive_above >= 2:
            increase = predicted_kbps * (self.MAX_CHANGE_RATIO / 2)
            new_bitrate = min(BITRATE_MAX, int(predicted_kbps + increase))
            state.consecutive_above = 0
            state.last_change_ts = current_ts

        return new_bitrate


class ABREngine:
    """Unified ABR engine: heuristic → ML → reactive feedback."""

    def __init__(self):
        self.heuristic = HeuristicABR()
        self.ml_model = MLABRModel()
        self.reactive = ReactiveABR()
        self._states: dict[str, ABRState] = {}

    def _get_state(self, participant_id: str) -> ABRState:
        if participant_id not in self._states:
            self._states[participant_id] = ABRState()
        return self._states[participant_id]

    def recommend(
        self,
        participant_id: str,
        stats: NetworkSample,
        actual_throughput_kbps: Optional[int] = None,
        content_type: str = "face",
        device_type: str = "desktop",
        browser: str = "chrome",
        network_type: str = "wifi",
        call_duration_s: float = 0.0,
        current_ts: float = 0.0,
    ) -> dict:
        state = self._get_state(participant_id)

        # Layer 2: ML
        ml_pred = self.ml_model.predict(
            stats, content_type, device_type, browser, network_type, call_duration_s
        )

        # Layer 1: Heuristic fallback
        heuristic_pred = self.heuristic.predict(stats, state)

        if ml_pred is not None:
            base_bitrate = ml_pred
            model_used = "xgboost"
        else:
            base_bitrate = heuristic_pred
            model_used = "heuristic"

        # Layer 3: Reactive adjustment
        if actual_throughput_kbps is not None:
            final_bitrate = self.reactive.adjust(
                base_bitrate, actual_throughput_kbps, state, current_ts
            )
        else:
            final_bitrate = base_bitrate

        state.current_bitrate_kbps = final_bitrate
        state.history.append(final_bitrate)

        return {
            "recommended_bitrate_kbps": final_bitrate,
            "heuristic_bitrate_kbps": heuristic_pred,
            "ml_bitrate_kbps": ml_pred,
            "model_used": model_used,
            "oscillation_count": state.oscillation_count,
            "confidence": 0.85 if model_used == "xgboost" else 0.65,
            "trigger": "adaptive",
        }

    def remove_participant(self, participant_id: str):
        self._states.pop(participant_id, None)


# Singleton
abr_engine = ABREngine()
