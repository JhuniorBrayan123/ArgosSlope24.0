#!/usr/bin/env python3
"""
ARGOS SLOPE 4.0 — Camera Calibration CLI.

Usage:
    # Full calibration with checkerboard images + optional ArUco
    python -m edge.calibration.run_calibration --dir calib_images/ --aruco scene.jpg

    # Scale-only from a previously calibrated camera
    python -m edge.calibration.run_calibration --aruco scene.jpg --scale-only

    # Check current calibration status
    python -m edge.calibration.run_calibration --status

    # Generate test checkerboard patterns (for printing)
    python -m edge.calibration.run_calibration --generate --output patterns/
"""

import argparse
import json
import logging
import sys
from pathlib import Path

# Allow running as script or module
if __name__ == "__main__" and __package__ is None:
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from edge.calibration.calibration_service import CalibrationService
    from edge.calibration.generate_test_patterns import generate_checkerboard
else:
    from edge.calibration.calibration_service import CalibrationService
    from edge.calibration.generate_test_patterns import generate_checkerboard

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("calibration")


def cmd_status(cal_path: Path):
    """Display current calibration status."""
    svc = CalibrationService(calibration_path=cal_path)
    status = svc.status()
    print()
    print("═══════════════════════════════════════════")
    print("  ARGOS SLOPE — Calibration Status")
    print("═══════════════════════════════════════════")
    print(f"  Calibrated:      {status.get('calibrated', False)}")
    print(f"  Scale detected:  {status.get('scale_detected', False)}")
    print(f"  Calibration date: {status.get('calibration_date', 'never')}")
    print(f"  fx_px:           {status.get('fx_px', 'N/A')}")
    print(f"  fy_px:           {status.get('fy_px', 'N/A')}")
    print(f"  cx_px:           {status.get('cx_px', 'N/A')}")
    print(f"  cy_px:           {status.get('cy_px', 'N/A')}")
    print(f"  pixels_per_mm:   {status.get('pixels_per_mm', 'N/A')}")
    print(f"  reprojection_error: {status.get('reprojection_error', 'N/A')}")
    print(f"  aruco_distance_m: {status.get('aruco_distance_m', 'N/A')}")
    print()

    if not status.get("calibrated"):
        print("  ⚠ Camera is NOT calibrated.")
        print("    Run: python -m edge.calibration.run_calibration --dir <images/>")
    if not status.get("scale_detected"):
        print("  ⚠ Scale (pixels_per_mm) NOT detected.")
        print("    Run with --aruco <image.jpg> for scale detection")
    print()


def cmd_full_calibration(
    cal_path: Path,
    checkerboard_dir: str,
    aruco_image: str | None,
):
    """Run full camera calibration + optional ArUco scale."""
    svc = CalibrationService(calibration_path=cal_path)

    cal_dir = Path(checkerboard_dir)
    if not cal_dir.is_dir():
        logger.error("Directory not found: %s", cal_dir)
        sys.exit(1)

    image_count = len(list(cal_dir.glob("*.[jJ][pP]*[gG]")) +
                      list(cal_dir.glob("*.[pP][nN][gG]")) +
                      list(cal_dir.glob("*.[bB][mM][pP]")))

    print()
    print("═══════════════════════════════════════════")
    print("  Full Camera Calibration")
    print("═══════════════════════════════════════════")
    print(f"  Images:    {image_count} in {checkerboard_dir}")
    print(f"  ArUco:     {aruco_image or '(using last checkerboard image)'}")
    print()

    if image_count < 5:
        logger.warning(
            "Only %d images found. At least 10-15 recommended for good calibration.",
            image_count,
        )
        proceed = input("Continue anyway? [y/N]: ").strip().lower()
        if proceed != "y":
            print("Calibration cancelled.")
            return

    try:
        result = svc.run_full_calibration(
            checkerboard_dir=checkerboard_dir,
            pattern_size=(9, 6),
            square_size_mm=25.0,
            aruco_image=aruco_image,
            marker_id=0,
            marker_size_mm=100.0,
        )
        print()
        print("✓ Calibration complete!")
        print(f"  fx_px:         {result.get('fx_px', 'N/A'):.2f}")
        print(f"  fy_px:         {result.get('fy_px', 'N/A'):.2f}")
        print(f"  cx_px:         {result.get('cx_px', 'N/A'):.2f}")
        print(f"  cy_px:         {result.get('cy_px', 'N/A'):.2f}")
        print(f"  pixels_per_mm: {result.get('pixels_per_mm', 'N/A')}")
        print(f"  Reprojection:  {result.get('reprojection_error', 'N/A'):.4f} px")
        print(f"  Saved to:      {cal_path}")
        print()

        if result.get("reprojection_error", 1.0) is not None and float(result.get("reprojection_error", 1.0) or 1.0) > 1.0:
            print("  ⚠ Reprojection error > 1.0px. Consider adding more images.")
            print("    Ideal: < 0.5px. Aceptable: < 1.0px.")

        print("  → Edge cargará estos valores automáticamente al reiniciar.")
        print()

    except Exception as e:
        logger.error("Calibration failed: %s", e)
        sys.exit(1)


def cmd_scale_only(
    cal_path: Path,
    aruco_image: str,
):
    """Run scale-only detection from a calibrated camera."""
    svc = CalibrationService(calibration_path=cal_path)

    if not Path(aruco_image).exists():
        logger.error("ArUco image not found: %s", aruco_image)
        sys.exit(1)

    if not svc.calibrated:
        logger.warning("Camera not calibrated. fx_px will be auto-detected if possible.")

    try:
        result = svc.quick_scale_from_aruco(
            aruco_image=aruco_image,
            marker_size_mm=100.0,
            marker_id=0,
        )
        print()
        print("✓ Scale detection complete!")
        print(f"  pixels_per_mm: {result.get('pixels_per_mm', 'N/A')}")
        print(f"  distance:      {result.get('aruco_distance_m', 'N/A'):.2f} m")
        print(f"  Saved to:      {cal_path}")
        print()
    except Exception as e:
        logger.error("Scale detection failed: %s", e)
        sys.exit(1)


def cmd_generate(output_dir: str):
    """Generate printable checkerboard patterns."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    patterns = [
        (9, 6, 25.0, "checkerboard_9x6_25mm.png"),
        (12, 8, 20.0, "checkerboard_12x8_20mm.png"),
    ]

    for cols, rows, size_mm, filename in patterns:
        path = out / filename
        try:
            generate_checkerboard(cols, rows, size_mm, str(path))
            print(f"  ✓ Generated: {path}")
        except Exception as e:
            logger.error("Failed to generate %s: %s", filename, e)

    print()
    print(f"Patterns saved to: {out}")
    print("Print on A4 paper, attach to a flat surface, and take 10-15 photos.")


def main():
    parser = argparse.ArgumentParser(
        description="ARGOS SLOPE 4.0 — Camera Calibration CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--cal-path",
        default=None,
        help="Path to calibration.json (default: edge/edge/calibration/calibration.json)",
    )

    # Mode selection
    parser.add_argument("--dir", help="Directory with checkerboard calibration images")
    parser.add_argument("--aruco", help="ArUco marker image for scale detection")
    parser.add_argument("--scale-only", action="store_true", help="Run scale detection only")
    parser.add_argument("--status", action="store_true", help="Show calibration status")
    parser.add_argument("--generate", action="store_true", help="Generate printable checkerboard patterns")
    parser.add_argument("--output", default="calib_patterns", help="Output directory for generated patterns")

    args = parser.parse_args()

    # Determine calibration.json path
    if args.cal_path:
        cal_path = Path(args.cal_path)
    else:
        cal_path = Path(__file__).parent / "calibration.json"

    if args.status:
        cmd_status(cal_path)
    elif args.generate:
        cmd_generate(args.output)
    elif args.scale_only:
        if not args.aruco:
            parser.error("--aruco is required with --scale-only")
        cmd_scale_only(cal_path, args.aruco)
    elif args.dir:
        cmd_full_calibration(cal_path, args.dir, args.aruco)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
