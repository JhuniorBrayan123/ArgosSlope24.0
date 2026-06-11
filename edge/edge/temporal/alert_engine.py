"""
ARGOS SLOPE 4.0 — Velocity-Based Alert Engine (Sprint 5).

Monitors crack deformation velocity and generates alerts when sustained
velocity thresholds are exceeded. Implements a per-track state machine:

    IDLE → ALERTING → RESOLVED → IDLE

The engine is fully decoupled from MQTT — it uses callable dependency
injection for publishing, making it testable without a broker.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class AlertLevel(IntEnum):
    """Alert severity levels ordered by increasing urgency."""

    NONE = 0
    MODERADA = 1
    RAPIDA = 2


@dataclass
class CrackAlertState:
    """
    Per-track state for the alert lifecycle.

    Tracks every variable needed for the three-state machine
    (IDLE / ALERTING / RESOLVED) plus consecutive measurement
    counting for hysteresis.
    """

    track_id: int
    level: AlertLevel = AlertLevel.NONE
    consecutive_count: int = 0
    alert_raised: bool = False
    alert_id: Optional[str] = None
    last_alerted_at: Optional[float] = None
    resolved_at: Optional[float] = None


class AlertEngine:
    """
    Velocity-based alert engine with configurable thresholds.

    Each tracked crack has its own independent state machine. The engine
    uses its own velocity thresholds (not hardcoded ``classify_velocity``)
    and injects a publisher callable for zero-coupling with MQTT.

    Args:
        velocity_moderada:
            Velocity threshold for ``MODERADA`` level (mm/day).
            Default 0.5.
        velocity_rapida:
            Velocity threshold for ``RAPIDA`` level (mm/day).
            Default 2.0.
        min_consecutive:
            Minimum number of consecutive temporal runs above the velocity
            threshold before an alert fires. Default 3.
        cooldown_minutes:
            Cooldown in minutes after resolution before the track can
            re-enter ALERTING. Default 60.
        moderada_enabled:
            If ``False``, ``MODERADA``-level alerts are suppressed.
        rapida_enabled:
            If ``False``, ``RAPIDA``-level alerts are suppressed.
        device_id:
            Device identifier included in alert payloads.
        publisher:
            Optional callable ``(payload: dict) -> bool`` invoked when a
            new alert transitions to ALERTING. Return value is ignored;
            exceptions are logged and swallowed.
    """

    def __init__(
        self,
        velocity_moderada: float = 0.5,
        velocity_rapida: float = 2.0,
        min_consecutive: int = 3,
        cooldown_minutes: int = 60,
        moderada_enabled: bool = True,
        rapida_enabled: bool = True,
        device_id: str = "argos-edge-01",
        publisher: Optional[Callable[[dict], bool]] = None,
    ) -> None:
        self.velocity_moderada = velocity_moderada
        self.velocity_rapida = velocity_rapida
        self.min_consecutive = min_consecutive
        self.cooldown_seconds = cooldown_minutes * 60
        self.moderada_enabled = moderada_enabled
        self.rapida_enabled = rapida_enabled
        self.device_id = device_id
        self._publisher = publisher
        self._states: dict[int, CrackAlertState] = {}

        logger.info(
            "AlertEngine initialized: moderada=%.2f, rapida=%.2f, "
            "min_consecutive=%d, cooldown=%d min, "
            "moderada_enabled=%s, rapida_enabled=%s",
            self.velocity_moderada,
            self.velocity_rapida,
            self.min_consecutive,
            cooldown_minutes,
            self.moderada_enabled,
            self.rapida_enabled,
        )

    # ── Level classification ─────────────────────────────────────────

    def _determine_level(self, velocity_mm_day: float) -> AlertLevel:
        """
        Classify a velocity reading into an alert level.

        Uses the engine's own configurable thresholds rather than the
        hardcoded ``classify_velocity()`` method.
        """
        if velocity_mm_day < 0:
            return AlertLevel.NONE
        if velocity_mm_day >= self.velocity_rapida:
            return AlertLevel.RAPIDA
        if velocity_mm_day >= self.velocity_moderada:
            return AlertLevel.MODERADA
        return AlertLevel.NONE

    # ── Core update ──────────────────────────────────────────────────

    def update(
        self,
        track_id: int,
        velocity_mm_day: float,
        roi_id: str = "",
        width_mm: float = 0.0,
        smoothed_velocity: Optional[float] = None,
    ) -> Optional[dict]:
        """
        Process a new velocity measurement for a tracked crack.

        State machine transitions:

        * **IDLE**\n
            Level >= MODERADA **and** consecutive >= min_consecutive
            → **ALERTING** (publishes alert, returns payload dict).

        * **ALERTING**\n
            Level drops below MODERADA
            → **RESOLVED** (sets ``resolved_at``, returns ``None``).

        * **RESOLVED**\n
            Cooldown elapsed
            → **IDLE** (returns ``None``).

        Args:
            track_id: Crack track identifier.
            velocity_mm_day: Instant velocity in mm/day.
            roi_id: ROI identifier for the crack (for payload).
            width_mm: Crack width in mm (for payload).
            smoothed_velocity: EMA-smoothed velocity (for payload).

        Returns:
            Payload dict when transitioning to ALERTING, otherwise
            ``None``.
        """
        state = self._get_or_create_state(track_id)

        # Determine current alert level from velocity
        level = self._determine_level(velocity_mm_day)

        # Update consecutive count: increasing/decreasing level
        if level >= state.level:
            state.consecutive_count += 1
        else:
            state.consecutive_count = 0

        # Store the new level
        state.level = level

        now = time.time()

        # ── State transitions ────────────────────────────────────────

        # RESOLVED + cooldown expired → IDLE
        if not state.alert_raised and state.resolved_at is not None:
            if now - state.resolved_at >= self.cooldown_seconds:
                logger.debug(
                    "Track %d: RESOLVED → IDLE (cooldown expired)",
                    track_id,
                )
                state.resolved_at = None

        # ALERTING + level < MODERADA → RESOLVED
        if state.alert_raised and level < AlertLevel.MODERADA:
            logger.debug(
                "Track %d: ALERTING → RESOLVED (velocity dropped)",
                track_id,
            )
            state.alert_raised = False
            state.resolved_at = now
            state.alert_id = None
            return None

        # IDLE + level >= MODERADA + consecutive >= min_consecutive → ALERTING
        if not state.alert_raised and state.resolved_at is None:
            if (
                level >= AlertLevel.MODERADA
                and state.consecutive_count >= self.min_consecutive
            ):
                # Check suppression flags
                should_alert = True
                if level == AlertLevel.RAPIDA and not self.rapida_enabled:
                    should_alert = False
                elif level == AlertLevel.MODERADA and not self.moderada_enabled:
                    should_alert = False

                if should_alert:
                    alert_id = f"ALT-{int(now)}-{track_id}"
                    state.alert_raised = True
                    state.alert_id = alert_id
                    state.last_alerted_at = now

                    payload = self._build_payload(
                        state=state,
                        track_id=track_id,
                        roi_id=roi_id,
                        width_mm=width_mm,
                        velocity_mm_day=velocity_mm_day,
                        smoothed_velocity=smoothed_velocity,
                        level=level,
                    )

                    # Invoke publisher callable if set
                    if self._publisher is not None:
                        try:
                            self._publisher(payload)
                        except Exception:
                            logger.exception(
                                "Alert publisher callable failed for track %d",
                                track_id,
                            )

                    logger.info(
                        "Track %d: IDLE → ALERTING (%s, v=%.4f mm/day)",
                        track_id,
                        payload["category"],
                        velocity_mm_day,
                    )
                    return payload

        # No alert transition
        return None

    # ── Payload builder ──────────────────────────────────────────────

    def _build_payload(
        self,
        state: CrackAlertState,
        track_id: int,
        roi_id: str,
        width_mm: float,
        velocity_mm_day: float,
        smoothed_velocity: Optional[float],
        level: AlertLevel,
    ) -> dict:
        """Build the MQTT payload for a velocity alert."""
        category = "moderada" if level == AlertLevel.MODERADA else "rapida"
        payload: dict = {
            "alert_id": state.alert_id,
            "event": "alerta_velocidad",
            "device_id": self.device_id,
            "track_id": track_id,
            "roi_id": roi_id,
            "level": int(level),
            "category": category,
            "velocity_mm_day": round(velocity_mm_day, 6),
            "smoothed_velocity": (
                round(smoothed_velocity, 6)
                if smoothed_velocity is not None
                else None
            ),
            "width_mm": round(width_mm, 4),
            "consecutive_measurements": state.consecutive_count,
            "timestamp": time.time(),
        }
        return payload

    # ── State management ─────────────────────────────────────────────

    def _get_or_create_state(self, track_id: int) -> CrackAlertState:
        """Return existing state for *track_id* or create a fresh one."""
        if track_id not in self._states:
            self._states[track_id] = CrackAlertState(track_id=track_id)
        return self._states[track_id]

    def get_state(self, track_id: int) -> Optional[CrackAlertState]:
        """Return the alert state for a given track, or ``None``."""
        return self._states.get(track_id)

    def get_states(self) -> dict[int, CrackAlertState]:
        """Return a copy of all tracked alert states."""
        return dict(self._states)

    def reset_track(self, track_id: int) -> None:
        """Remove alert state for a single track."""
        self._states.pop(track_id, None)

    def reset_all(self) -> None:
        """Remove all alert states."""
        self._states.clear()
