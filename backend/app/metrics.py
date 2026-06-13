"""Prometheus metrics for StreamSafe."""
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response

# Counters
sessions_created_total = Counter("sessions_created_total", "Total sessions created")
sessions_ended_total = Counter("sessions_ended_total", "Total sessions ended", ["resolved"])
chat_messages_total = Counter("chat_messages_total", "Total chat messages sent")
api_errors_total = Counter("api_errors_total", "Total API errors", ["endpoint", "status_code"])
ws_connections_total = Counter("ws_connections_total", "Total WebSocket connections")

# Histograms
join_latency_seconds = Histogram(
    "join_latency_seconds",
    "Session join latency in seconds",
    buckets=[0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 2.0, 5.0],
)
api_request_duration_seconds = Histogram(
    "api_request_duration_seconds",
    "API request duration",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
)
bitrate_kbps = Histogram(
    "bitrate_kbps",
    "Adaptive bitrate values",
    buckets=[250, 500, 800, 1200, 1500, 2000, 3000, 4000],
)

# Gauges
active_sessions = Gauge("active_sessions", "Currently active sessions")
active_ws_connections = Gauge("active_ws_connections", "Active WebSocket connections")
sfu_packet_loss_ratio = Gauge("sfu_packet_loss_ratio", "SFU packet loss ratio")


def metrics_endpoint():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
