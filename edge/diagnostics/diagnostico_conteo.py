"""
DIAGNÓSTICO DE CONTEO DE FISURAS — ARGOS SLOPE 4.0

Procesa una imagen del prototipo/talud y muestra:
  1. Cuántas fisuras detecta el pipeline actual (OpenCvDetector)
  2. Imagen con bounding boxes numerados
  3. Máscara binaria (lo que el threshold "ve" como fisuras)
  4. Comparación con el pipeline de esqueletización (AnalyzerPipeline)

USO:
    python diagnostics/diagnostico_conteo.py
"""

import sys
import os
from pathlib import Path

# ── Asegurar que el proyecto está en el path ──
# El script está en: ArgosSlope4.0/edge/diagnostics/diagnostico_conteo.py
# El paquete edge está en: ArgosSlope4.0/edge/edge/
# Para importar "from edge.detector...", debemos estar en edge/ o tenerlo en sys.path
DIAG_DIR = Path(__file__).resolve().parent           # .../edge/diagnostics/
EDGE_DIR = DIAG_DIR.parent                            # .../edge/
sys.path.insert(0, str(EDGE_DIR))                     # edge/ en path → edge/edge/ es el "edge" package

import cv2
import numpy as np

# ── Importar detectores del proyecto ──
from edge.detector.fisura_detector import OpenCvDetector, CrackResult
from edge.analyzer.crack_segmenter import CrackSegmenter
from edge.analyzer.skeletonizer import Skeletonizer
from edge.analyzer.crack_measurement import CrackMeasurement
from edge.analyzer.crack_validator import CrackValidator
from edge.analyzer.preprocess_service import PreprocessService
from edge.analyzer.overlay_renderer import OverlayRenderer

# ── Rutas ──
IMG_PATH = EDGE_DIR / "edge" / "calibration" / "calib_images" / "Imagen1.jpeg"
OUTPUT_DIR = EDGE_DIR / "diagnostics" / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Colores (BGR) ──
GREEN = (0, 255, 0)
RED = (0, 0, 255)
TEAL = (170, 212, 0)
ORANGE = (0, 165, 255)
BLUE = (255, 0, 0)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
YELLOW = (0, 255, 255)

# =====================================================================
#  1. CARGAR IMAGEN
# =====================================================================
print("=" * 70)
print("DIAGNÓSTICO DE CONTEO DE FISURAS")
print("=" * 70)

img = cv2.imread(str(IMG_PATH))
if img is None:
    print(f"❌ ERROR: No se pudo cargar la imagen en {IMG_PATH}")
    sys.exit(1)

print(f"\n📷 Imagen: {IMG_PATH.name}")
print(f"   Dimensiones: {img.shape[1]}x{img.shape[0]} px, {img.shape[2]} canales")

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
h, w = gray.shape

# =====================================================================
#  2. DETECTOR ACTUAL (OpenCvDetector)
# =====================================================================
print("\n" + "─" * 70)
print("🔴 PASO 1: DETECTOR ACTUAL (OpenCvDetector)")
print("─" * 70)

detector = OpenCvDetector()
cracks = detector.process(img)
rejected = detector.get_rejected_contours() if hasattr(detector, "get_rejected_contours") else []

print(f"\n   ✅ Fisuras detectadas: {len(cracks)}")
print(f"   ❌ Contornos rechazados: {len(rejected)}")
print(f"   🟢 Aceptados vs 🔴 Rechazados: {len(cracks)}/{len(cracks) + len(rejected)}")

# Mostrar primeros 10 cracks como muestra
print(f"\n   📋 Primeras {min(10, len(cracks))} fisuras:")
for i, c in enumerate(cracks[:10]):
    print(f"      {c.roi_id}: pos=({c.x},{c.y}) tamaño={c.width}x{c.height} "
          f"largo={c.length_mm:.1f}mm ancho={c.width_mm:.3f}mm "
          f"clasif={c.classification.value}")

# ── Generar máscara binaria (lo que el threshold ve) ──
mask = detector._segment_cracks(gray)

# ── Debug: imagen con bounding boxes (VERDES) y contornos rechazados (ROJOS) ──
debug_img = img.copy()

# Dibujar contornos rechazados en rojo
for contour, reason in rejected:
    cv2.drawContours(debug_img, [contour], -1, RED, 1)

# Dibujar bounding boxes de aceptados en verde, numerados
for idx, crack in enumerate(cracks, 1):
    x, y, bw, bh = crack.x, crack.y, crack.width, crack.height
    cv2.rectangle(debug_img, (x, y), (x + bw, y + bh), GREEN, 2)
    # Número grande
    cv2.putText(debug_img, str(idx), (x + 2, y + 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, GREEN, 2)
    # Etiqueta con ID y medida
    label = f"{crack.roi_id} {crack.length_mm:.0f}mm"
    cv2.putText(debug_img, label, (x, y - 5),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, GREEN, 1)

# Leyenda
cv2.rectangle(debug_img, (5, 5), (220, 70), BLACK, -1)
cv2.putText(debug_img, f"Detector actual", (10, 22),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, WHITE, 1)
cv2.putText(debug_img, f"Aceptadas: {len(cracks)}", (10, 42),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, GREEN, 1)
cv2.putText(debug_img, f"Rechazadas: {len(rejected)}", (10, 62),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, RED, 1)

cv2.imwrite(str(OUTPUT_DIR / "01_detector_actual.jpg"), debug_img)
print(f"\n   💾 Guardado: 01_detector_actual.jpg")

# ── Guardar máscara binaria ──
mask_colored = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
cv2.putText(mask_colored, f"Mask binaria - {len(cracks)} contornos aceptados",
            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, WHITE, 2)
cv2.imwrite(str(OUTPUT_DIR / "02_mask_binaria.jpg"), mask_colored)
print(f"   💾 Guardado: 02_mask_binaria.jpg")

# =====================================================================
#  3. PIPELINE DE ESQUELETIZACIÓN (AnalyzerPipeline)
# =====================================================================
print("\n" + "─" * 70)
print("🟢 PASO 2: PIPELINE DE ESQUELETIZACIÓN (AnalyzerPipeline 2D)")
print("─" * 70)

# Preprocesar (necesita imagen BGR, no gray)
processed = PreprocessService.process(img)

# Segmentar
binary = CrackSegmenter.segment(processed)

# Validar
valid = CrackValidator.filter_contours(binary)

# Esqueletizar
skeleton = Skeletonizer.process(valid)

# Medir (cada rama del esqueleto = 1 fisura)
measurements = CrackMeasurement.measure(valid, skeleton, mm_per_px=1.0)

print(f"\n   ✅ Fisuras por esqueleto (ramas): {len(measurements)}")

# Mostrar primeras 10
print(f"\n   📋 Primeras {min(10, len(measurements))} fisuras:")
for m in measurements[:10]:
    print(f"      {m['id']}: largo={m['length_px']:.0f}px, "
          f"apertura={m['aperture_px']:.1f}px, "
          f"orientación={m['orientation']:.0f}°")

# ── Overlay del esqueleto ──
skeleton_bgr = cv2.cvtColor(valid, cv2.COLOR_GRAY2BGR)
# Dibujar esqueleto en rojo sobre la máscara
skel_pts = np.column_stack(np.where(skeleton > 0))
for py, px in skel_pts[:10000]:  # limitar para no saturar
    cv2.circle(skeleton_bgr, (px, py), 1, (0, 0, 255), -1)
cv2.putText(skeleton_bgr, f"Esqueleto - {len(measurements)} ramas",
            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, WHITE, 2)
cv2.imwrite(str(OUTPUT_DIR / "03_esqueleto.jpg"), skeleton_bgr)
print(f"   💾 Guardado: 03_esqueleto.jpg")

# ── Overlay de fisuras numeradas sobre la imagen original ──
overlay_img = img.copy()
for m in measurements:
    bx, by, bw, bh = m["bbox"]["x"], m["bbox"]["y"], m["bbox"]["w"], m["bbox"]["h"]
    cv2.rectangle(overlay_img, (bx, by), (bx + bw, by + bh), TEAL, 2)
    label = f"{m['id']}"
    cv2.putText(overlay_img, label, (bx + 2, by + 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, TEAL, 2)

cv2.rectangle(overlay_img, (5, 5), (220, 45), BLACK, -1)
cv2.putText(overlay_img, f"Pipeline esqueleto", (10, 22),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, WHITE, 1)
cv2.putText(overlay_img, f"Ramas: {len(measurements)}", (10, 42),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, TEAL, 1)

cv2.imwrite(str(OUTPUT_DIR / "04_esqueleto_overlay.jpg"), overlay_img)
print(f"   💾 Guardado: 04_esqueleto_overlay.jpg")

# =====================================================================
#  4. COMPARATIVA Y RESUMEN
# =====================================================================
print("\n" + "─" * 70)
print("📊 COMPARATIVA")
print("─" * 70)

total_contours = len(cracks) + len(rejected)
print(f"""
   ┌─────────────────────────────────────┬──────────┐
   │ Pipeline                            │  Conteo  │
   ├─────────────────────────────────────┼──────────┤
   │ Detector actual (contornos)         │ {len(cracks):>8} │
   │ Contornos rechazados                │ {len(rejected):>8} │
   │ Pipeline esqueleto (ramas)          │ {len(measurements):>8} │
   └─────────────────────────────────────┴──────────┘
""")

# =====================================================================
#  5. DETECCIÓN CON PARÁMETROS ALTERNATIVOS (prueba)
# =====================================================================
print("─" * 70)
print("🔧 PASO 3: PRUEBAS CON PARÁMETROS ALTERNATIVOS")
print("─" * 70)

print("\n   A) Variando área mínima (min_contour_area_px) con adaptive C=5...")
try:
    for min_area in [100, 200, 500, 800, 1000, 1500]:
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        binary_test = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 31, 5
        )
        kernel = np.ones((3, 3), np.uint8)
        binary_test = cv2.morphologyEx(binary_test, cv2.MORPH_CLOSE, kernel)
        binary_test = cv2.morphologyEx(binary_test, cv2.MORPH_OPEN, kernel)
        
        contours_test, _ = cv2.findContours(binary_test, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        filtered = []
        margin = 3
        frame_h, frame_w = gray.shape
        for cnt in contours_test:
            area = cv2.contourArea(cnt)
            if area < min_area:
                continue
            x, y, cw, ch = cv2.boundingRect(cnt)
            if x <= margin or y <= margin or x + cw >= frame_w - margin or y + ch >= frame_h - margin:
                continue
            filtered.append(cnt)
        
        print(f"      min_area={min_area:>5} px → {len(filtered):>4} fisuras")
        
        if min_area in [200, 500, 1000]:
            test_img = img.copy()
            for cnt in filtered:
                x, y, cw, ch = cv2.boundingRect(cnt)
                cv2.rectangle(test_img, (x, y), (x + cw, y + ch), YELLOW, 2)
            cv2.putText(test_img, f"min_area={min_area} -> {len(filtered)} fisuras",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, WHITE, 2)
            cv2.imwrite(str(OUTPUT_DIR / f"05_minarea_{min_area}.jpg"), test_img)
            print(f"      💾 Guardado: 05_minarea_{min_area}.jpg")

except Exception as e:
    print(f"      ⚠️ Error: {e}")

print("\n   B) Variando C de adaptive threshold (con min_area=200)...")
try:
    for c_val in [2, 5, 8, 12, 15]:
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        binary_test = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 31, c_val
        )
        kernel = np.ones((3, 3), np.uint8)
        binary_test = cv2.morphologyEx(binary_test, cv2.MORPH_CLOSE, kernel)
        binary_test = cv2.morphologyEx(binary_test, cv2.MORPH_OPEN, kernel)
        
        contours_test, _ = cv2.findContours(binary_test, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        filtered = []
        margin = 3
        frame_h, frame_w = gray.shape
        for cnt in contours_test:
            area = cv2.contourArea(cnt)
            if area < 200:
                continue
            x, y, cw, ch = cv2.boundingRect(cnt)
            if x <= margin or y <= margin or x + cw >= frame_w - margin or y + ch >= frame_h - margin:
                continue
            filtered.append(cnt)
        
        print(f"      C={c_val:>2} → {len(filtered):>4} fisuras")
        
        if c_val in [2, 8, 15]:
            test_img = img.copy()
            for cnt in filtered:
                x, y, cw, ch = cv2.boundingRect(cnt)
                cv2.rectangle(test_img, (x, y), (x + cw, y + ch), ORANGE, 2)
            cv2.putText(test_img, f"C={c_val} min_area=200 -> {len(filtered)} fisuras",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, WHITE, 2)
            cv2.imwrite(str(OUTPUT_DIR / f"06_C_{c_val}.jpg"), test_img)
            print(f"      💾 Guardado: 06_C_{c_val}.jpg")

except Exception as e:
    print(f"      ⚠️ Error: {e}")

print("\n   C) Canny Edge Detection + Connected Components (alternativa)...")
try:
    for (low, high) in [(30, 90), (50, 150), (80, 200)]:
        edges = cv2.Canny(gray, low, high)
        # Dilatar para conectar bordes cercanos
        kernel = np.ones((2, 2), np.uint8)
        edges_dilated = cv2.dilate(edges, kernel, iterations=1)
        
        # Connected components
        num_labels, labels = cv2.connectedComponents(edges_dilated)
        # num_labels incluye el fondo (label 0), así que -1
        print(f"      Canny({low},{high}) → {num_labels - 1:>4} componentes")
        
        if low == 50:
            # Colorear cada componente
            colored = cv2.applyColorMap(
                (labels.astype(np.uint8) * (255 // max(1, num_labels))),
                cv2.COLORMAP_RAINBOW
            )
            cv2.putText(colored, f"Canny({low},{high}) -> {num_labels-1} componentes",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, WHITE, 2)
            cv2.imwrite(str(OUTPUT_DIR / "07_canny_50_150.jpg"), colored)
            print(f"      💾 Guardado: 07_canny_50_150.jpg")

except Exception as e:
    print(f"      ⚠️ Error: {e}")

# =====================================================================
#  6. RESUMEN FINAL
# =====================================================================
print("\n" + "=" * 70)
print("📋 RESUMEN")
print("=" * 70)
print(f"""
   📸 Imagen analizada:    {IMG_PATH.name} ({w}x{h})
   🔴 Detector actual:     {len(cracks)} fisuras
   🟢 Pipeline esqueleto:  {len(measurements)} ramas
   📁 Outputs guardados en: {OUTPUT_DIR}
""")

print("✅ Diagnóstico completado. Revisa las imágenes en diagnostics/output/")
print("=" * 70)
