"""
ARGOS SLOPE 4.0 — Crack Tracking Module.

Associates crack detections across frames using centroid + IoU matching
to maintain persistent track IDs for temporal velocity calculation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from edge.detector.fisura_detector import CrackResult

logger = logging.getLogger(__name__)


@dataclass
class TrackedCrack:
    """Internal representation of a tracked crack."""
    track_id: int
    bbox: tuple[int, int, int, int]  # x, y, w, h in reference frame
    center: tuple[float, float]      # center_x, center_y in reference frame
    width_mm: float
    length_mm: float
    area_mm2: float
    last_seen_frame: int
    velocity_mm_day: Optional[float] = None
    smoothed_velocity: Optional[float] = None


class CrackTracker:
    """
    Tracks cracks across frames using centroid + IoU matching.

    Pipeline:
        1. Transform current crack centroids/bboxes to reference frame using homography H
        2. For each current crack, find best match in active tracks by IoU
        3. If IoU >= threshold: assign existing track_id, update track
        4. If no match: assign new track_id (incremental)
        5. Update active_tracks with current cracks
        6. Return cracks with track_id assigned

    Usage:
        tracker = CrackTracker(iou_threshold=0.3)
        tracked_cracks = tracker.update(current_cracks, H, frame_number)
    """

    def __init__(
        self,
        iou_threshold: float = 0.3,
        max_missed_frames: int = 30,
    ) -> None:
        """
        Initialize the CrackTracker.

        Args:
            iou_threshold: Minimum IoU to consider a match (default 0.3).
            max_missed_frames: Remove tracks not seen for this many frames.
        """
        self.iou_threshold = iou_threshold
        self.max_missed_frames = max_missed_frames
        self.next_track_id = 1
        self.active_tracks: dict[int, TrackedCrack] = {}
        self.frame_count = 0

        logger.info(
            "CrackTracker initialized: iou_threshold=%.2f, max_missed_frames=%d",
            self.iou_threshold,
            self.max_missed_frames,
        )

    def update(
        self,
        current_cracks: list[CrackResult],
        H: np.ndarray,
        frame_number: int,
    ) -> list[CrackResult]:
        """
        Associate current cracks with existing tracks.

        Args:
            current_cracks: List of CrackResult from current frame (no track_id).
            H: 3x3 homography matrix (current frame → reference frame).
            frame_number: Current frame number for aging tracks.

        Returns:
            List of CrackResult with track_id assigned.
        """
        self.frame_count = frame_number

        if not current_cracks:
            # Age out old tracks
            self._age_tracks()
            return []

        # Transform current cracks to reference frame
        transformed_cracks = []
        for crack in current_cracks:
            # Transform center point
            center_h = np.array([[crack.center_x], [crack.center_y], [1.0]], dtype=np.float64)
            center_ref_h = H @ center_h
            if center_ref_h[2, 0] != 0:
                center_ref = (center_ref_h[0, 0] / center_ref_h[2, 0], center_ref_h[1, 0] / center_ref_h[2, 0])
            else:
                center_ref = (float(crack.center_x), float(crack.center_y))

            # Transform bbox corners
            x, y, w, h = crack.x, crack.y, crack.width, crack.height
            corners = np.array([
                [x, y, 1],
                [x + w, y, 1],
                [x + w, y + h, 1],
                [x, y + h, 1],
            ], dtype=np.float64).T  # 3x4
            corners_ref_h = H @ corners
            # Normalize homogeneous coordinates
            corners_ref = corners_ref_h[:2] / corners_ref_h[2:3]
            x_min = int(np.min(corners_ref[0]))
            y_min = int(np.min(corners_ref[1]))
            x_max = int(np.max(corners_ref[0]))
            y_max = int(np.max(corners_ref[1]))
            bbox_ref = (x_min, y_min, x_max - x_min, y_max - y_min)

            transformed_cracks.append({
                'crack': crack,
                'center_ref': center_ref,
                'bbox_ref': bbox_ref,
            })

        # Match with existing tracks
        matched_track_ids = set()
        for tc in transformed_cracks:
            best_track_id = None
            best_iou = 0.0

            for track_id, track in self.active_tracks.items():
                if track_id in matched_track_ids:
                    continue
                iou = self._compute_iou(tc['bbox_ref'], track.bbox)
                if iou >= self.iou_threshold and iou > best_iou:
                    best_iou = iou
                    best_track_id = track_id

            if best_track_id is not None:
                # Match found - update existing track
                track = self.active_tracks[best_track_id]
                track.bbox = tc['bbox_ref']
                track.center = tc['center_ref']
                track.width_mm = tc['crack'].width_mm
                track.length_mm = tc['crack'].length_mm
                track.area_mm2 = tc['crack'].area_mm2
                track.last_seen_frame = self.frame_count
                matched_track_ids.add(best_track_id)
                tc['crack'].track_id = best_track_id
            else:
                # New track
                new_id = self.next_track_id
                self.next_track_id += 1
                self.active_tracks[new_id] = TrackedCrack(
                    track_id=new_id,
                    bbox=tc['bbox_ref'],
                    center=tc['center_ref'],
                    width_mm=tc['crack'].width_mm,
                    length_mm=tc['crack'].length_mm,
                    area_mm2=tc['crack'].area_mm2,
                    last_seen_frame=self.frame_count,
                )
                matched_track_ids.add(new_id)
                tc['crack'].track_id = new_id

        # Age out tracks not seen this frame
        self._age_tracks()

        # Return cracks with track_id
        return [tc['crack'] for tc in transformed_cracks]

    def _compute_iou(self, box1: tuple[int, int, int, int], box2: tuple[int, int, int, int]) -> float:
        """Compute IoU between two bounding boxes (x, y, w, h)."""
        x1, y1, w1, h1 = box1
        x2, y2, w2, h2 = box2

        # Intersection
        xi1 = max(x1, x2)
        yi1 = max(y1, y2)
        xi2 = min(x1 + w1, x2 + w2)
        yi2 = min(y1 + h1, y2 + h2)

        inter_w = max(0, xi2 - xi1)
        inter_h = max(0, yi2 - yi1)
        inter_area = inter_w * inter_h

        if inter_area == 0:
            return 0.0

        box1_area = w1 * h1
        box2_area = w2 * h2
        union_area = box1_area + box2_area - inter_area

        return inter_area / union_area if union_area > 0 else 0.0

    def _age_tracks(self) -> None:
        """Remove tracks not seen for max_missed_frames."""
        to_remove = []
        for track_id, track in self.active_tracks.items():
            if self.frame_count - track.last_seen_frame > self.max_missed_frames:
                to_remove.append(track_id)
        for track_id in to_remove:
            del self.active_tracks[track_id]
            logger.debug("Track %d removed (max missed frames exceeded)", track_id)

    def get_active_tracks(self) -> dict[int, TrackedCrack]:
        """Return copy of active tracks."""
        return self.active_tracks.copy()

    def reset(self) -> None:
        """Reset tracker state."""
        self.active_tracks.clear()
        self.next_track_id = 1
        self.frame_count = 0
        logger.info("CrackTracker reset")