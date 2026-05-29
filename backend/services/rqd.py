"""
Rock Quality Designation (RQD) calculation for ARGOS SLOPE 4.0.

RQD measures the quality of a rock core based on the proportion of intact
pieces ≥ 10 cm relative to the total core length.

    RQD = (Σ x_i / L_total) × 100

Where:
    x_i      = lengths of intact core pieces ≥ minimum block size
    L_total  = total core length
"""

from __future__ import annotations


def calculate_rqd(
    piece_lengths_cm: list[float],
    core_length_m: float,
    min_block_cm: float = 10.0,
) -> dict:
    """
    Calculate Rock Quality Designation (RQD) percentage.

    Only pieces ≥ ``min_block_cm`` (default 10 cm) are counted as intact.
    Smaller pieces are ignored (treated as crushed/fractured material).

    Args:
        piece_lengths_cm: List of intact core piece lengths in cm.
        core_length_m: Total core length in meters.
        min_block_cm: Minimum piece length to count as intact (default 10.0 cm).

    Returns:
        Dictionary with:
            - ``rqd_percent``: RQD value rounded to 2 decimal places.
            - ``intact_pieces_count``: Number of pieces ≥ min_block_cm.
            - ``pieces_below_threshold``: Number of pieces < min_block_cm.
            - ``total_intact_length_cm``: Sum of intact piece lengths in cm.

    Raises:
        ValueError: If core_length_m ≤ 0, min_block_cm ≤ 0, or
            piece_lengths_cm is empty.
    """
    if core_length_m <= 0:
        raise ValueError("core_length_m must be > 0")
    if min_block_cm <= 0:
        raise ValueError("min_block_cm must be > 0")
    if not piece_lengths_cm:
        raise ValueError("piece_lengths_cm must not be empty")

    core_length_cm = core_length_m * 100.0

    # Separate pieces ≥ threshold and < threshold
    intact_pieces = [p for p in piece_lengths_cm if p >= min_block_cm]
    below_threshold = [p for p in piece_lengths_cm if p < min_block_cm]

    total_intact_cm = sum(intact_pieces)

    rqd_percent = (total_intact_cm / core_length_cm) * 100.0
    rqd_percent = round(rqd_percent, 2)

    return {
        "rqd_percent": rqd_percent,
        "intact_pieces_count": len(intact_pieces),
        "pieces_below_threshold": len(below_threshold),
        "total_intact_length_cm": round(total_intact_cm, 2),
    }


def calculate_rqd_simple(
    fracture_count: int,
    core_length: float,
    min_block_cm: float = 10.0,
) -> float:
    """
    Simplified RQD calculation from fracture count.

    This is a convenience wrapper for the GET /api/rqd endpoint. It models
    the core as having ``fracture_count`` intact pieces at exactly the minimum
    block size, with the remaining material treated as broken fragments.

    This approximates the relationship: more fractures → lower RQD.

    Args:
        fracture_count: Number of fractures counted in the core section.
        core_length: Total core length in meters.
        min_block_cm: Minimum piece length to count as intact (default 10.0 cm).

    Returns:
        RQD percentage rounded to 2 decimal places.

    Raises:
        ValueError: If core_length ≤ 0 or fracture_count < 0.
    """
    if core_length <= 0:
        raise ValueError("core_length must be > 0")
    if fracture_count < 0:
        raise ValueError("fracture_count must be ≥ 0")
    if min_block_cm <= 0:
        raise ValueError("min_block_cm must be > 0")

    core_length_cm = core_length * 100.0
    total_intact_cm = fracture_count * min_block_cm

    # Clamp to max 100%
    if total_intact_cm > core_length_cm:
        total_intact_cm = core_length_cm

    rqd_percent = (total_intact_cm / core_length_cm) * 100.0
    return round(rqd_percent, 2)
