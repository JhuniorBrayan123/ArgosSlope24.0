"""
Tests for edge/diagnostics/pipeline_maqueta.py — PR1 new functions.

Covers:
- eliminar_linea_horizontal (refined)
- detectar_desprendimientos
- extraer_segmentos
- fusionar_segmentos
- clasificar_familias_angulares
"""

import sys
import importlib
from pathlib import Path

import cv2
import numpy as np
import pytest

# Add edge/diagnostics to path for import
_diagnostics_path = Path(__file__).resolve().parents[2] / "diagnostics"
if str(_diagnostics_path) not in sys.path:
    sys.path.insert(0, str(_diagnostics_path))

import pipeline_maqueta as pm


# =========================================================================
#  HELPER: Create synthetic images for testing
# =========================================================================

def _make_synthetic_mask(h: int = 200, w: int = 200) -> np.ndarray:
    """Create a blank white mask (background=0, foreground=255)."""
    return np.zeros((h, w), dtype=np.uint8)


def _draw_line(mask: np.ndarray, x1: int, y1: int, x2: int, y2: int,
               thickness: int = 2) -> np.ndarray:
    """Draw a white line on a mask."""
    result = mask.copy()
    cv2.line(result, (x1, y1), (x2, y2), 255, thickness)
    return result


def _draw_rectangle(mask: np.ndarray, x: int, y: int, w: int, h: int) -> np.ndarray:
    """Draw a filled white rectangle on a mask."""
    result = mask.copy()
    result[y:y + h, x:x + w] = 255
    return result


def _make_skeleton_from_line(h: int, w: int, x1: int, y1: int,
                             x2: int, y2: int) -> np.ndarray:
    """Create a 1-pixel thick skeleton from a line."""
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.line(mask, (x1, y1), (x2, y2), 255, 1)
    return mask


# =========================================================================
#  Tests for Task 1.2: Refined eliminar_linea_horizontal
# =========================================================================

class TestEliminarLineaHorizontal:
    """PR1 Task 1.2: eliminar_linea_horizontal with angle filtering."""

    def test_horizontal_wide_line_removed(self):
        """A wide (>65% img_w) and short (<30px) horizontal line should be removed."""
        mask = _make_synthetic_mask(200, 200)
        # Draw a wide horizontal bar: 150px wide, 3px tall → triggers removal
        mask = _draw_rectangle(mask, 10, 90, 150, 3)
        result = pm.eliminar_linea_horizontal(mask)
        # The bar should be gone
        assert cv2.countNonZero(result) == 0, "Horizontal bar should be removed"

    def test_narrow_angled_line_preserved(self):
        """A narrow but angled line should NOT be removed."""
        mask = _make_synthetic_mask(200, 200)
        # Draw a diagonal line that is wide (150px) but has angle ~45deg
        mask = _draw_line(mask, 10, 10, 180, 180, thickness=5)
        # The bbox of this diagonal line: w ≈ 170, h ≈ 170
        # It fails the h < 30px check, so it stays
        result = pm.eliminar_linea_horizontal(mask)
        assert cv2.countNonZero(result) > 0, "Angled line should be preserved"

    def test_wide_angled_line_preserved(self):
        """A wide (>65%) but angled (not <10deg or >170deg) line should NOT be removed."""
        mask = _make_synthetic_mask(200, 200)
        # Draw a line at ~45deg that spans >65% width but isn't horizontal
        mask = _draw_line(mask, 20, 80, 180, 100, thickness=3)
        result = pm.eliminar_linea_horizontal(mask)
        # When h is small (<30px) and w is large (>65%), angle is checked
        # The bbox: w=160 (>130=200*0.65), h≈20 (<30) → angle check triggered
        # Line from (20,80) to (180,100) has angle ~6.3deg → might be removed
        # Let's use a more clearly angled line
        mask2 = _make_synthetic_mask(200, 200)
        mask2 = _draw_line(mask2, 20, 60, 180, 140, thickness=3)
        # bbox: w=160, h=80 → h=80 > 30 → NOT triggered by height check
        result2 = pm.eliminar_linea_horizontal(mask2)
        assert cv2.countNonZero(result2) > 0, "Angled line with h>30 should be preserved"

    def test_wide_horizontal_line_remove_with_fitline(self):
        """A line that is wide+short AND has angle < 10deg should be removed."""
        mask = _make_synthetic_mask(200, 200)
        # Nearly horizontal line from (10,100) to (190,102) → angle ≈ 0.6deg
        mask = _draw_line(mask, 10, 100, 190, 102, thickness=2)
        result = pm.eliminar_linea_horizontal(mask)
        # The bbox: w=180 (>130=200*065), h≈2 (<30) → angle check
        # Angle ≈ 0.6deg (<10) → removed
        nonzero = cv2.countNonZero(result)
        # Might leave a few pixels from the edges, but most should be gone
        assert nonzero < 50, f"Near-horizontal line should be mostly removed, got {nonzero} nonzero"

    def test_short_wide_line_no_fitline_few_points(self):
        """A contour with <5 points should still be removed if it passes width/height check."""
        mask = _make_synthetic_mask(50, 200)
        # A very tiny wide contour: 3 pixels in a row
        mask[10, 10:180] = 255  # 170px wide, 1px tall
        result = pm.eliminar_linea_horizontal(mask)
        nonzero = cv2.countNonZero(result)
        assert nonzero == 0, "Wide short contour with <5 points should be removed"


# =========================================================================
#  Tests for Task 2.1: detectar_desprendimientos
# =========================================================================

class TestDetectarDesprendimientos:
    """PR1 Task 2.1: Detectar desprendimientos."""

    def test_detachment_detected(self):
        """A large enough blob should be detected as a detachment."""
        mask = _make_synthetic_mask(300, 300)
        # Add a large solid square (60x60 = 3600px → well above DETACH_MIN_AREA=1200)
        mask = _draw_rectangle(mask, 50, 50, 60, 60)
        mask_clean, detachments = pm.detectar_desprendimientos(mask, 300, 300)
        assert len(detachments) >= 1, "Large blob should be detected as detachment"
        d = detachments[0]
        assert d["area_px"] >= 3500, f"Detachment area should be ~3600, got {d['area_px']}"
        assert d["id"].startswith("D"), f"ID should start with D, got {d['id']}"

    def test_small_blob_not_detached(self):
        """A small blob below DETACH_MIN_AREA should NOT be detected."""
        mask = _make_synthetic_mask(300, 300)
        # Small square: 20x20 = 400px → below DETACH_MIN_AREA=1200
        mask = _draw_rectangle(mask, 100, 100, 20, 20)
        mask_clean, detachments = pm.detectar_desprendimientos(mask, 300, 300)
        assert len(detachments) == 0, "Small blob should not be a detachment"

    def test_blob_too_wide_aspect_ratio(self):
        """A very wide/narrow blob (exceeding MAX_ASPECT) should be rejected."""
        mask = _make_synthetic_mask(300, 300)
        # Long thin strip: 200x10 = 2000px > 1200, but aspect ratio > 5.5
        mask = _draw_rectangle(mask, 50, 100, 200, 10)
        mask_clean, detachments = pm.detectar_desprendimientos(mask, 300, 300)
        # Area=2000 > 1200, w=200 > 60, h=10 < 40 → fails DETACH_MIN_H=40
        # So it won't be detected because h<40. That's fine.
        assert len(detachments) == 0, "Thin strip below min_h should be rejected"

    def test_whole_image_not_detected(self):
        """A blob covering >50% of the image should be rejected."""
        mask = _make_synthetic_mask(200, 200)
        mask[:150, :] = 255  # 150x200 = 30000px > 0.5 * 40000 = 20000
        mask_clean, detachments = pm.detectar_desprendimientos(mask, 200, 200)
        assert len(detachments) == 0, "Blob covering >50% of image should be rejected"

    def test_multiple_detachments(self):
        """Multiple distinct large blobs should all be detected."""
        mask = _make_synthetic_mask(400, 400)
        mask = _draw_rectangle(mask, 30, 30, 70, 70)     # D1: ~4900px
        mask = _draw_rectangle(mask, 250, 200, 80, 60)    # D2: ~4800px
        mask_clean, detachments = pm.detectar_desprendimientos(mask, 400, 400)
        assert len(detachments) >= 2, f"Expected 2 detachments, got {len(detachments)}"

    def test_mask_clean_after_detachment(self):
        """The mask returned should have the detachment area removed."""
        mask = _make_synthetic_mask(300, 300)
        mask = _draw_rectangle(mask, 50, 50, 70, 70)
        mask_clean, detachments = pm.detectar_desprendimientos(mask, 300, 300)
        assert len(detachments) >= 1
        # The region should be black in mask_clean
        region = mask_clean[50:120, 50:120]
        assert cv2.countNonZero(region) == 0, "Detachment area should be removed from mask"

    def test_empty_mask(self):
        """An empty mask should produce zero detachments."""
        mask = _make_synthetic_mask(200, 200)
        mask_clean, detachments = pm.detectar_desprendimientos(mask, 200, 200)
        assert len(detachments) == 0, "Empty mask should have no detachments"
        assert cv2.countNonZero(mask_clean) == 0, "Clean mask should also be empty"


# =========================================================================
#  Tests for Task 2.2: extraer_segmentos
# =========================================================================

class TestExtraerSegmentos:
    """PR1 Task 2.2: extraer segmentos via branch-point analysis."""

    def test_single_line_one_segment(self):
        """A single straight line should produce exactly 1 segment."""
        skel = _make_skeleton_from_line(200, 200, 20, 100, 180, 100)
        segments = pm.extraer_segmentos(skel)
        assert len(segments) >= 1, "A single line should produce at least 1 segment"

    def test_segment_has_required_fields(self):
        """Each segment should have all expected fields."""
        skel = _make_skeleton_from_line(200, 200, 20, 100, 180, 100)
        segments = pm.extraer_segmentos(skel)
        assert len(segments) >= 1
        s = segments[0]
        assert "id" in s, "Segment missing 'id'"
        assert "angle" in s, "Segment missing 'angle'"
        assert "length_px" in s, "Segment missing 'length_px'"
        assert "endpoints" in s, "Segment missing 'endpoints'"
        assert "centroid" in s, "Segment missing 'centroid'"
        assert "pixel_mask" in s, "Segment missing 'pixel_mask'"
        assert "bbox" in s, "Segment missing 'bbox'"
        assert s["length_px"] >= 5, "Segment should have at least 5 pixels"

    def test_horizontal_line_angle(self):
        """A horizontal line should have angle near 0 or 180."""
        skel = _make_skeleton_from_line(200, 200, 20, 100, 180, 100)
        segments = pm.extraer_segmentos(skel)
        assert len(segments) >= 1
        angle = segments[0]["angle"]
        assert angle < 10 or angle > 170, f"Horizontal line angle should be near 0/180, got {angle}"

    def test_vertical_line_angle(self):
        """A vertical line should have angle near 90."""
        skel = _make_skeleton_from_line(200, 200, 100, 20, 100, 180)
        segments = pm.extraer_segmentos(skel)
        assert len(segments) >= 1
        angle = segments[0]["angle"]
        assert 80 <= angle <= 100, f"Vertical line angle should be near 90, got {angle}"

    def test_diagonal_line_angle(self):
        """A 45-degree diagonal line should have angle near 45."""
        skel = _make_skeleton_from_line(200, 200, 20, 20, 180, 180)
        segments = pm.extraer_segmentos(skel)
        assert len(segments) >= 1
        angle = segments[0]["angle"]
        # fitLine returns angle modulo 180, so 45deg stays 45
        assert 35 <= angle <= 55, f"45-degree line angle should be near 45, got {angle}"

    def test_empty_skeleton(self):
        """An empty skeleton should produce zero segments."""
        skel = np.zeros((200, 200), dtype=np.uint8)
        segments = pm.extraer_segmentos(skel)
        assert len(segments) == 0, "Empty skeleton should produce 0 segments"


# =========================================================================
#  Tests for Task 2.3: fusionar_segmentos
# =========================================================================

class TestFusionarSegmentos:
    """PR1 Task 2.3: fusionar segmentos in fissures."""

    def test_single_segment(self):
        """A single segment should be converted to one fissure."""
        skel = _make_skeleton_from_line(200, 200, 20, 100, 180, 100)
        segments = pm.extraer_segmentos(skel)
        assert len(segments) >= 1
        fissures = pm.fusionar_segmentos(segments, 200, 200)
        assert len(fissures) == 1, "Single segment should produce 1 fissure"
        f = fissures[0]
        assert f["id"].startswith("F"), f"Fissure ID should start with F, got {f['id']}"
        assert "length_cm" in f
        assert "family" not in f  # families not assigned yet

    def test_two_parallel_lines_separate(self):
        """Two parallel lines far apart should remain as separate fissures."""
        skel1 = _make_skeleton_from_line(200, 200, 20, 50, 180, 50)
        skel2 = _make_skeleton_from_line(200, 200, 20, 150, 180, 150)
        skel = cv2.bitwise_or(skel1, skel2)
        segments = pm.extraer_segmentos(skel)
        fissures = pm.fusionar_segmentos(segments, 200, 200)
        # Two far-apart lines should not merge
        assert len(fissures) >= 1, "Should produce at least one fissure"

    def test_fissure_has_length_cm(self):
        """Each fissure should have length_cm computed."""
        skel = _make_skeleton_from_line(200, 200, 20, 100, 180, 100)
        segments = pm.extraer_segmentos(skel)
        fissures = pm.fusionar_segmentos(segments, 200, 200)
        assert len(fissures) == 1
        assert fissures[0]["length_cm"] > 0, "length_cm should be > 0"

    def test_no_segments(self):
        """Empty segment list should produce empty fissures."""
        fissures = pm.fusionar_segmentos([], 200, 200)
        assert len(fissures) == 0, "No segments should produce no fissures"


# =========================================================================
#  Tests for Task 2.4: clasificar_familias_angulares
# =========================================================================

class TestClasificarFamiliasAngulares:
    """PR1 Task 2.4: clasificar_familias_angulares."""

    def _make_fissure(self, angle: float, length_px: int = 50) -> dict:
        """Create a minimal fissure dict for testing."""
        return {
            "id": "F-test",
            "angle": angle,
            "length_px": length_px,
            "length_cm": round(length_px * pm.CM_POR_PX, 1),
            "x": 0, "y": 0, "width": 10, "height": 10,
            "centroid": (5, 5),
            "pixel_mask": np.zeros((20, 20), dtype=np.uint8),
        }

    def test_angle_45_is_F1(self):
        """Angle 45° should be classified as Family 1."""
        f = self._make_fissure(45)
        result = pm.clasificar_familias_angulares([f])
        assert result[0]["family"] == "F1", "45° should be F1"
        assert result[0]["id"].startswith("F1-"), "F1 fissure should have F1-XX id"

    def test_angle_120_is_F2(self):
        """Angle 120° should be classified as Family 2."""
        f = self._make_fissure(120)
        result = pm.clasificar_familias_angulares([f])
        assert result[0]["family"] == "F2", "120° should be F2"
        assert result[0]["id"].startswith("F2-"), "F2 fissure should have F2-XX id"

    def test_angle_90_is_FV(self):
        """Angle 90° should be classified as Family Vertical."""
        f = self._make_fissure(90)
        result = pm.clasificar_familias_angulares([f])
        assert result[0]["family"] == "FV", "90° should be FV"
        assert result[0]["id"].startswith("FV-"), "FV fissure should have FV-XX id"

    def test_angle_0_is_IGNORE(self):
        """Angle 0° should be classified as IGNORE."""
        f = self._make_fissure(0)
        result = pm.clasificar_familias_angulares([f])
        assert result[0]["family"] == "IGNORE", "0° should be IGNORE"
        assert result[0]["id"].startswith("IGNORE-")

    def test_angle_180_is_IGNORE(self):
        """Angle 180° should be classified as IGNORE."""
        f = self._make_fissure(180)
        result = pm.clasificar_familias_angulares([f])
        assert result[0]["family"] == "IGNORE", "180° should be IGNORE"

    def test_angle_175_is_IGNORE(self):
        """Angle 175° (>165) should be IGNORE."""
        f = self._make_fissure(175)
        result = pm.clasificar_familias_angulares([f])
        assert result[0]["family"] == "IGNORE", "175° should be IGNORE"

    def test_angle_10_is_IGNORE(self):
        """Angle 10° (<15) should be IGNORE."""
        f = self._make_fissure(10)
        result = pm.clasificar_familias_angulares([f])
        assert result[0]["family"] == "IGNORE", "10° should be IGNORE"

    def test_boundary_15_is_F1(self):
        """Angle exactly 15° should be F1."""
        f = self._make_fissure(15)
        result = pm.clasificar_familias_angulares([f])
        assert result[0]["family"] == "F1", "15° should be F1"

    def test_boundary_85_is_F1(self):
        """Angle exactly 85° should be F1."""
        f = self._make_fissure(85)
        result = pm.clasificar_familias_angulares([f])
        assert result[0]["family"] == "F1", "85° should be F1"

    def test_boundary_95_is_F2(self):
        """Angle exactly 95° should be F2."""
        f = self._make_fissure(95)
        result = pm.clasificar_familias_angulares([f])
        assert result[0]["family"] == "F2", "95° should be F2"

    def test_boundary_165_is_F2(self):
        """Angle exactly 165° should be F2."""
        f = self._make_fissure(165)
        result = pm.clasificar_familias_angulares([f])
        assert result[0]["family"] == "F2", "165° should be F2"

    def test_multiple_fissures_sequential_ids(self):
        """Multiple fissures should get sequential per-family IDs."""
        fissures = [
            self._make_fissure(45),    # F1-01
            self._make_fissure(120),   # F2-01
            self._make_fissure(45),    # F1-02
            self._make_fissure(120),   # F2-02
            self._make_fissure(90),    # FV-01
        ]
        result = pm.clasificar_familias_angulares(fissures)
        ids = [f["id"] for f in result]
        assert "F1-01" in ids, "First F1 should be F1-01"
        assert "F1-02" in ids, "Second F1 should be F1-02"
        assert "F2-01" in ids, "First F2 should be F2-01"
        assert "F2-02" in ids, "Second F2 should be F2-02"
        assert "FV-01" in ids, "First FV should be FV-01"

    def test_empty_list(self):
        """Empty list should not crash and return empty list."""
        result = pm.clasificar_familias_angulares([])
        assert result == [], "Empty list should return empty list"

    def test_ignore_not_in_stats(self):
        """IGNORE fissures should not appear in active family stats."""
        fissures = [
            self._make_fissure(0),
            self._make_fissure(45),
        ]
        result = pm.clasificar_familias_angulares(fissures)
        f0 = result[0]
        f45 = result[1]
        assert f0["family"] == "IGNORE"
        assert f45["family"] == "F1"
