"""
ARGOS SLOPE 4.0 — Crack History Persistence Module.

Stores temporal crack measurements to a local JSON file store so that
velocity calculations survive process restarts.

Schema (``crack_history``):
    tracking_id  : int
    timestamp    : ISO-8601 datetime string
    width_mm     : float
    length_mm    : float
    area_mm2     : float
    classification : str
    is_new       : bool
    velocity_mm_day : float | null
    frame_number : int

Usage:
    store = JsonCrackHistoryStore("crack_history.json")
    store.save_snapshot(track_id=1, width_mm=2.5, ...)
    history = store.load_all()

To swap in PostgreSQL later, implement the ``CrackHistoryStore`` ABC.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class CrackSnapshot:
    """
    A single historical measurement for a tracked crack.

    Maps directly to the ``crack_history`` table in the backend DB.
    """

    tracking_id: int
    timestamp: str  # ISO-8601
    width_mm: float
    length_mm: float = 0.0
    area_mm2: float = 0.0
    classification: str = "none"
    is_new: bool = False
    velocity_mm_day: Optional[float] = None
    frame_number: int = 0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> CrackSnapshot:
        return cls(**data)


class CrackHistoryStore(ABC):
    """Abstract interface for crack history storage backends."""

    @abstractmethod
    def save_snapshot(self, snapshot: CrackSnapshot) -> None:
        """Persist one measurement snapshot."""

    @abstractmethod
    def load_all(self) -> list[CrackSnapshot]:
        """Load all stored snapshots in insertion order."""

    @abstractmethod
    def load_by_track(self, tracking_id: int) -> list[CrackSnapshot]:
        """Load all snapshots for a specific track, sorted by timestamp."""

    @abstractmethod
    def clear_all(self) -> None:
        """Delete all stored snapshots."""


class JsonCrackHistoryStore(CrackHistoryStore):
    """
    Persists crack history to a local JSON file.

    Each call to ``save_snapshot`` appends to the in-memory list and
    flushes the entire list to disk. This is safe for low-frequency
    writes (e.g. once per capture frame) but not for high-throughput.

    Args:
        file_path: Path to the JSON file. Created if it does not exist.
    """

    def __init__(self, file_path: str | Path) -> None:
        self._path = Path(file_path)
        self._snapshots: list[CrackSnapshot] = []
        self._load_from_disk()

        logger.info(
            "JsonCrackHistoryStore initialized: path=%s, existing_records=%d",
            self._path,
            len(self._snapshots),
        )

    # ── Public API ──────────────────────────────────────────────────

    def save_snapshot(self, snapshot: CrackSnapshot) -> None:
        """Append a snapshot and flush to disk."""
        self._snapshots.append(snapshot)
        self._flush()
        logger.debug(
            "Snapshot saved: track_id=%d, width_mm=%.4f, ts=%s",
            snapshot.tracking_id,
            snapshot.width_mm,
            snapshot.timestamp,
        )

    def load_all(self) -> list[CrackSnapshot]:
        """Return all snapshots in insertion order."""
        return list(self._snapshots)

    def load_by_track(self, tracking_id: int) -> list[CrackSnapshot]:
        """Return all snapshots for a track, sorted by timestamp."""
        matched = [
            s for s in self._snapshots if s.tracking_id == tracking_id
        ]
        matched.sort(key=lambda s: s.timestamp)
        return matched

    def clear_all(self) -> None:
        """Delete all snapshots in memory and on disk."""
        self._snapshots.clear()
        if self._path.exists():
            self._path.unlink()
        logger.info("Crack history store cleared")

    # ── Internal ────────────────────────────────────────────────────

    def _load_from_disk(self) -> None:
        """Load existing snapshots from the JSON file."""
        if not self._path.exists():
            self._snapshots = []
            return
        try:
            with open(self._path, "r") as f:
                data = json.load(f)
            if isinstance(data, list):
                self._snapshots = [CrackSnapshot.from_dict(item) for item in data]
            else:
                logger.warning("Invalid format in %s — expected JSON list", self._path)
                self._snapshots = []
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to load crack history from %s: %s", self._path, exc)
            self._snapshots = []

    def _flush(self) -> None:
        """Write all snapshots to the JSON file atomically."""
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            # Write to temp file, then rename for atomicity
            tmp = self._path.with_suffix(".tmp")
            with open(tmp, "w") as f:
                json.dump(
                    [s.to_dict() for s in self._snapshots],
                    f,
                    indent=2,
                    default=str,
                )
            tmp.replace(self._path)
        except OSError as exc:
            logger.error("Failed to flush crack history: %s", exc)
