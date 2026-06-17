"""
Growth alert engine for ARGOS SLOPE 4.0.

Monitors crack growth over time by comparing the latest measurement against
the baseline. When growth Δ exceeds a configurable threshold, the system
flags it as critical for dashboard alerting.

    Δ = ((A_actual - A_anterior) / A_anterior) × 100

Where:
    A_actual   = most recent measurement (mm)
    A_anterior = first/baseline measurement (mm)
"""

from __future__ import annotations


def check_growth(
    measurements_mm: list[float],
    threshold_percent: float = 5.0,
) -> dict:
    """
    Evaluate crack growth against a configurable threshold.

    Computes the percentage change between the first (baseline) and last
    (current) measurement. If the change exceeds ``threshold_percent``,
    the result is flagged as critical.

    Args:
        measurements_mm: Chronological list of crack length/width
            measurements in mm. Must contain at least 2 values.
        threshold_percent: Growth percentage that triggers a critical
            alert (default 5.0). Must be > 0.

    Returns:
        Dictionary with:
            - ``is_critical``: ``True`` if Δ exceeds threshold.
            - ``delta_percent``: Calculated growth percentage.

    Raises:
        ValueError: If fewer than 2 measurements provided, threshold ≤ 0,
            or the first measurement is zero (division by zero).
    """
    if len(measurements_mm) < 2:
        raise ValueError("At least 2 measurements required")
    if threshold_percent <= 0:
        raise ValueError("threshold_percent must be > 0")

    first = measurements_mm[0]
    last = measurements_mm[-1]

    if first == 0:
        raise ValueError("First measurement cannot be zero (division by zero)")

    delta_percent = ((last - first) / first) * 100.0
    is_critical = delta_percent > threshold_percent

    return {
        "is_critical": is_critical,
        "delta_percent": round(delta_percent, 2),
    }


def calculate_delta(
    current_value: float,
    previous_value: float,
) -> float:
    """
    Calculate percentage change between two measurements.

    Args:
        current_value: Most recent measurement (mm).
        previous_value: Previous measurement (mm).

    Returns:
        Percentage change, rounded to 2 decimal places.

    Raises:
        ValueError: If previous_value is zero.
    """
    if previous_value == 0:
        raise ValueError("previous_value cannot be zero (division by zero)")

    delta = ((current_value - previous_value) / previous_value) * 100.0
    return round(delta, 2)


def is_critical(
    delta_percent: float,
    threshold_percent: float = 5.0,
) -> bool:
    """
    Determine whether a delta value exceeds the critical threshold.

    Args:
        delta_percent: Computed growth percentage.
        threshold_percent: Critical threshold (default 5.0).

    Returns:
        ``True`` if delta_percent > threshold_percent.
    """
    return delta_percent > threshold_percent
