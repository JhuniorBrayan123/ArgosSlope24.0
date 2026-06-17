"""
PIPELINE MONITORING — Wrapper invocable por .NET backend
=========================================================
Ejecuta el pipeline de detección de fisuras o comparación de imágenes
y devuelve JSON por stdout para que el backend .NET lo capture.

USO:
    python pipeline_monitoring.py --command capture --image ruta.jpg [--roi x,y,w,h]
    python pipeline_monitoring.py --command save_base --image ruta.jpg --output base_ref.jpg
    python pipeline_monitoring.py --command compare --image ruta.jpg --base base_ref.jpg
"""

import argparse
import base64
import contextlib
import json
import os
import sys
import time
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np

# ── Silenciar prints del pipeline_maqueta durante la importación ──
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

# Redirigir stdout a null temporalmente para silenciar prints al importar
with contextlib.redirect_stdout(open(os.devnull, 'w', encoding='utf-8')):
    # Importar funciones del pipeline principal
    from pipeline_maqueta import (
    MAQUETA_ANCHO_CM, MAQUETA_ALTO_CM, CM_POR_PX, IMG_W, IMG_H,
    corregir_perspectiva, cargar_imagen, capturar_camara,
    generar_mascara_binaria, limpiar_mascara, eliminar_bordes,
    eliminar_linea_horizontal, detectar_desprendimientos,
    obtener_skeleton, extraer_segmentos, fusionar_segmentos,
    clasificar_familias_angulares, MIN_LENGTH_CM,
)


# =====================================================================
#  COMPARACIÓN DE IMÁGENES (SIFT + homografía)
# =====================================================================

def registrar_imagenes(img_base: np.ndarray, img_current: np.ndarray):
    """
    Registra img_current al espacio de coordenadas de img_base usando SIFT + homografía.
    Retorna (img_registrada, homography, inliers_count, matches_count).
    """
    gray_base = cv2.cvtColor(img_base, cv2.COLOR_BGR2GRAY)
    gray_curr = cv2.cvtColor(img_current, cv2.COLOR_BGR2GRAY)

    sift = cv2.SIFT_create()
    kp1, des1 = sift.detectAndCompute(gray_base, None)
    kp2, des2 = sift.detectAndCompute(gray_curr, None)

    if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
        raise ValueError("No hay suficientes features SIFT para registrar las imágenes.")

    index_params = dict(algorithm=1, trees=5)
    search_params = dict(checks=50)
    flann = cv2.FlannBasedMatcher(index_params, search_params)
    matches = flann.knnMatch(des1, des2, k=2)

    good_matches = []
    for m, n in matches:
        if m.distance < 0.75 * n.distance:
            good_matches.append(m)

    if len(good_matches) < 4:
        raise ValueError(f"Solo {len(good_matches)} matches buenos, se necesitan al menos 4.")

    src_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)

    if H is None:
        raise ValueError("No se pudo calcular la homografía.")

    inliers = int(mask.sum())
    h_reg, w_reg = img_base.shape[:2]
    img_registrada = cv2.warpPerspective(img_current, H, (w_reg, h_reg))

    return img_registrada, H, inliers, len(good_matches)


def comparar_imagenes(img_base: np.ndarray, img_current: np.ndarray):
    """
    Compara dos imágenes registradas y devuelve diferencias.
    Retorna dict con overlay, estadísticas, y mapa de diferencias.
    """
    # Registrar imagen actual al espacio de la base
    img_reg, H, inliers, matches = registrar_imagenes(img_base, img_current)
    h, w = img_base.shape[:2]

    # Diferencia absoluta
    gray_base = cv2.cvtColor(img_base, cv2.COLOR_BGR2GRAY)
    gray_reg = cv2.cvtColor(img_reg, cv2.COLOR_BGR2GRAY)

    diff = cv2.absdiff(gray_base, gray_reg)
    _, diff_mask = cv2.threshold(diff, 40, 255, cv2.THRESH_BINARY)

    # Limpiar máscara de diferencia
    kernel = np.ones((5, 5), np.uint8)
    diff_mask = cv2.morphologyEx(diff_mask, cv2.MORPH_CLOSE, kernel)
    diff_mask = cv2.morphologyEx(diff_mask, cv2.MORPH_OPEN, kernel)

    # Estadísticas por región
    total_px = w * h
    diff_px = int(cv2.countNonZero(diff_mask))
    base_unique_px = diff_px  # píxeles diferentes = únicos de la base
    overlap_px = total_px - diff_px

    # Overlay visual: rojo = base única, verde = current única, semitransparente = overlap
    overlay = img_base.copy()
    overlay[diff_mask > 0] = (0, 0, 200)  # rojo para diferencias

    overlap_mask = (diff_mask == 0).astype(np.uint8) * 255
    overlay_color = img_base.copy()
    overlay_color = cv2.addWeighted(overlay_color, 0.5, img_reg, 0.5, 0)

    # Mapa de solo diferencias
    diff_colored = np.zeros((h, w, 3), dtype=np.uint8)
    diff_colored[diff_mask > 0] = (0, 0, 200)  # rojo

    # Detectar regiones de desprendimiento (componentes conectados grandes en diff)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(diff_mask, connectivity=8)
    detachments = []
    min_detach_area = 500  # px
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if area >= min_detach_area:
            x = int(stats[i, cv2.CC_STAT_LEFT])
            y = int(stats[i, cv2.CC_STAT_TOP])
            cw = int(stats[i, cv2.CC_STAT_WIDTH])
            ch = int(stats[i, cv2.CC_STAT_HEIGHT])
            detachments.append({
                "x": x, "y": y, "w": cw, "h": ch,
                "area_px": int(area),
                "area_cm2": round(area * (CM_POR_PX ** 2), 1),
            })

    # Overlay de solo diferencias en rojo con fondo original semitransparente
    overlay_result = cv2.addWeighted(img_base, 0.4, diff_colored, 0.6, 0)

    # Codificar overlay a base64
    _, buffer = cv2.imencode(".jpg", overlay_result)
    overlay_b64 = base64.b64encode(buffer).decode("ascii")

    # También codificar diff_mask
    _, buf_diff = cv2.imencode(".jpg", diff_colored)
    diff_b64 = base64.b64encode(buf_diff).decode("ascii")

    _, buf_reg = cv2.imencode(".jpg", img_reg)
    registered_b64 = base64.b64encode(buf_reg).decode("ascii")

    return {
        "overlay_base64": overlay_b64,
        "diff_mask_base64": diff_b64,
        "registered_base64": registered_b64,
        "stats": {
            "total_px": total_px,
            "different_px": diff_px,
            "overlap_px": overlap_px,
            "pct_different": round(diff_px / total_px * 100, 1) if total_px > 0 else 0,
            "pct_overlap": round(overlap_px / total_px * 100, 1) if total_px > 0 else 0,
        },
        "detachments": detachments,
        "registration": {
            "inliers": inliers,
            "total_matches": matches,
        }
    }


# =====================================================================
#  PIPELINE DE CAPTURA (envuelve pipeline_maqueta)
# =====================================================================

def run_capture_pipeline(image_path: str, roi: dict = None):
    """
    Ejecuta el pipeline completo de detección de fisuras sobre una imagen.
    Devuelve dict con resultados + overlay en base64.
    """
    # Cargar imagen (silenciando prints)
    img = _silent_call(cargar_imagen, image_path)

    # Aplicar ROI si se especifica
    if roi and roi.get("w", 0) > 0 and roi.get("h", 0) > 0:
        x, y, w, h = int(roi["x"]), int(roi["y"]), int(roi["w"]), int(roi["h"])
        if x + w <= img.shape[1] and y + h <= img.shape[0]:
            img = img[y:y+h, x:x+w]

    # Pipeline (todo silenciado para que stdout = JSON puro)
    def _run_pipeline(img):
        img_corregida = corregir_perspectiva(img, None)
        gray = cv2.cvtColor(img_corregida, cv2.COLOR_BGR2GRAY)
        mask = generar_mascara_binaria(gray)
        mask = limpiar_mascara(mask)
        mask = eliminar_bordes(mask)
        mask = eliminar_linea_horizontal(mask)
        mask_sin_desprendimientos, desprendimientos = detectar_desprendimientos(mask, IMG_H, IMG_W)
        skeleton = obtener_skeleton(mask_sin_desprendimientos)
        segments = extraer_segmentos(skeleton)
        fisuras = fusionar_segmentos(segments, IMG_W, IMG_H) if segments else []
        if fisuras:
            fisuras = clasificar_familias_angulares(fisuras)
        return img_corregida, mask_sin_desprendimientos, desprendimientos, skeleton, fisuras

    img_corregida, mask_sin_desprendimientos, desprendimientos, skeleton, fisuras = _silent_call(_run_pipeline, img)

    # Filtrar por longitud mínima
    if MIN_LENGTH_CM > 0:
        fisuras = [f for f in fisuras if f["length_cm"] >= MIN_LENGTH_CM or f.get("family") == "IGNORE"]

    active_fisuras = [f for f in fisuras if f.get("family") != "IGNORE"]

    # Calcular estadísticas de familias
    familias_stats = {}
    for fam in ["F1", "F2", "FV"]:
        members = [f for f in active_fisuras if f["family"] == fam]
        if members:
            familias_stats[fam] = {
                "count": len(members),
                "total_cm": round(sum(f["length_cm"] for f in members), 1),
            }

    total_cm = sum(f["length_cm"] for f in active_fisuras)

    # Generar overlay (sin guardar archivo)
    overlay_img = _generar_overlay(img_corregida, active_fisuras, desprendimientos, skeleton)

    # Codificar overlay a base64
    _, buffer = cv2.imencode(".jpg", overlay_img)
    overlay_b64 = base64.b64encode(buffer).decode("ascii")

    # Preparar fisuras para JSON
    fisuras_json = []
    for f in active_fisuras:
        entry = {k: v for k, v in f.items() if k != "pixel_mask"}
        entry["angle_deg"] = entry.pop("angle", 0)
        fisuras_json.append(entry)

    return {
        "zoneId": "talud-maqueta-01",
        "cracks": [_fisura_to_frontend(f) for f in active_fisuras],
        "spacing": _calc_spacing(active_fisuras, familias_stats),
        "imageBase64": overlay_b64,
        "total_fisuras": len(active_fisuras),
        "total_length_cm": round(total_cm, 1),
        "familias": familias_stats,
        "desprendimientos": desprendimientos,
        "fisuras_raw": fisuras_json,
    }


def _fisura_to_frontend(f: dict) -> dict:
    """Convierte formato interno de pipeline al formato que espera el frontend."""
    return {
        "id": f.get("id", 0),
        "family": f.get("family", "N/A"),
        "length_mm": round(f.get("length_cm", 0) * 10, 1),  # cm → mm
        "length_px": f.get("length_px", 0),
        "orientation": round(f.get("angle", 0), 1),
        "x": f.get("x", 0),
        "y": f.get("y", 0),
        "width": f.get("width", 0),
        "height": f.get("height", 0),
        "confidence": round(f.get("confidence", 1.0), 2),
    }


def _calc_spacing(fisuras: list, familias_stats: dict) -> dict:
    """Calcula espaciamiento y RQD estimado."""
    by_family = {}
    for fam in ["F1", "F2", "FV"]:
        members = [f for f in fisuras if f["family"] == fam]
        if not members:
            continue
        stats = familias_stats.get(fam, {})
        count = stats.get("count", len(members))
        total_cm = stats.get("total_cm", 0)
        spacing_mm = (total_cm * 10) / count if count > 0 else 0
        by_family[fam] = {
            "count": count,
            "total_cm": total_cm,
            "spacing_mm": round(spacing_mm, 1),
        }

    # RQD estimado (Palmström simplificado)
    total_fisuras = sum(s["count"] for s in by_family.values()) if by_family else 0
    estimated_rqd = max(0, 100 - (total_fisuras * 3)) if total_fisuras > 0 else 100

    return {
        "by_family": by_family,
        "estimated_rqd": round(estimated_rqd, 1),
    }


def _generar_overlay(img: np.ndarray, fisuras: list, desprendimientos: list,
                     skeleton: np.ndarray = None) -> np.ndarray:
    """Genera overlay visual similar al pipeline original pero en memoria."""
    overlay = img.copy()

    # Colores por familia
    family_colors = {
        "F1": (0, 0, 200),    # rojo
        "F2": (200, 100, 0),  # azul
        "FV": (200, 0, 200),  # magenta
    }

    # Dibujar esqueleto en gris sutil
    if skeleton is not None:
        skel_rgb = np.stack([skeleton] * 3, axis=-1) * np.array([100, 100, 100], dtype=np.uint8)
        overlay = cv2.addWeighted(overlay, 1.0, skel_rgb, 0.3, 0)

    # Dibujar fisuras
    for f in fisuras:
        color = family_colors.get(f.get("family", ""), (0, 200, 0))

        # Dibujar la máscara de píxeles de la fisura si existe
        if "pixel_mask" in f and f["pixel_mask"] is not None:
            mask = f["pixel_mask"]
            if isinstance(mask, np.ndarray):
                overlay[mask > 0] = color
            # También dibujar el bounding box
            if "x" in f and "y" in f and "width" in f and "height" in f:
                cv2.rectangle(overlay,
                              (f["x"], f["y"]),
                              (f["x"] + f["width"], f["y"] + f["height"]),
                              color, 1)

        # Label
        if "id" in f:
            label = f"{f.get('family', '?')}#{f['id']}"
            cx = f.get("x", 0) + f.get("width", 0) // 2
            cy = f.get("y", 0)
            cv2.putText(overlay, label, (cx, max(cy - 5, 15)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1, cv2.LINE_AA)

    # Dibujar desprendimientos
    for d in desprendimientos:
        if "x" in d and "y" in d and "w" in d and "h" in d:
            cv2.rectangle(overlay,
                          (d["x"], d["y"]),
                          (d["x"] + d["w"], d["y"] + d["h"]),
                          (0, 165, 255), 2)  # naranja
            cv2.putText(overlay, f"Desprendimiento {d.get('area_cm2', 0):.0f}cm2",
                        (d["x"], d["y"] - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 165, 255), 1)

    return overlay


# =====================================================================
#  CLI
# =====================================================================

def _silent_call(func, *args, **kwargs):
    """Llama a una función del pipeline silenciando sus prints."""
    with contextlib.redirect_stdout(open(os.devnull, 'w', encoding='utf-8')):
        return func(*args, **kwargs)


def main():
    parser = argparse.ArgumentParser(
        description="Pipeline Monitoring - Wrapper para .NET backend")
    parser.add_argument("--command", required=True,
                        choices=["capture", "save_base", "compare"],
                        help="Comando a ejecutar")
    parser.add_argument("--image", type=str, default=None,
                        help="Ruta a la imagen actual (capture/compare)")
    parser.add_argument("--base", type=str, default=None,
                        help="Ruta a la imagen base (para compare)")
    parser.add_argument("--output", type=str, default=None,
                        help="Ruta de salida (para save_base)")
    parser.add_argument("--roi", type=str, default=None,
                        help="ROI en formato x,y,w,h")
    parser.add_argument("--camera", type=int, default=None,
                        help="Índice de cámara (alternativa a --image)")
    args = parser.parse_args()

    # Parsear ROI
    roi = None
    if args.roi:
        parts = args.roi.split(",")
        if len(parts) == 4:
            roi = {
                "x": float(parts[0]),
                "y": float(parts[1]),
                "w": float(parts[2]),
                "h": float(parts[3]),
            }

    try:
        if args.command == "capture":
            if not args.image and args.camera is None:
                # Buscar imagen por defecto
                default_img = SCRIPT_DIR / ".." / "calibration" / "calib_images" / "Imagen1.jpeg"
                if default_img.exists():
                    args.image = str(default_img)
                else:
                    print(json.dumps({"error": "No se especificó imagen ni cámara"}))
                    sys.exit(1)

            if args.camera is not None:
                # Capturar de cámara
                img = _silent_call(capturar_camara, args.camera)
                temp_path = str(SCRIPT_DIR / "output" / "_capture_temp.jpg")
                Path(SCRIPT_DIR / "output").mkdir(parents=True, exist_ok=True)
                cv2.imwrite(temp_path, img)
                args.image = temp_path

            result = run_capture_pipeline(args.image, roi)
            print(json.dumps(result, indent=2, ensure_ascii=False))

        elif args.command == "save_base":
            # Guardar imagen como base de referencia
            if not args.image and args.camera is None:
                print(json.dumps({"error": "No se especificó imagen"}))
                sys.exit(1)

            if args.camera is not None:
                img = _silent_call(capturar_camara, args.camera)
            else:
                img = _silent_call(cargar_imagen, args.image)

            output_path = args.output or str(SCRIPT_DIR / "output" / "_base_ref.jpg")
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(output_path, img)

            print(json.dumps({
                "success": True,
                "message": "Imagen base guardada",
                "path": output_path,
                "isBaseImage": True,
                "zoneId": "talud-maqueta-01",
            }))

        elif args.command == "compare":
            if not args.image and args.camera is None:
                print(json.dumps({"error": "No se especificó imagen actual"}))
                sys.exit(1)

            # Buscar imagen base
            base_path = args.base or str(SCRIPT_DIR / "output" / "_base_ref.jpg")
            if not Path(base_path).exists():
                print(json.dumps({
                    "error": "No hay imagen base guardada. Ejecutá 'save_base' primero.",
                    "code": "NO_BASE_IMAGE"
                }))
                sys.exit(1)

            if args.camera is not None:
                img = _silent_call(capturar_camara, args.camera)
                temp_path = str(SCRIPT_DIR / "output" / "_compare_temp.jpg")
                Path(SCRIPT_DIR / "output").mkdir(parents=True, exist_ok=True)
                cv2.imwrite(temp_path, img)
                args.image = temp_path

            img_base = _silent_call(cargar_imagen, base_path)
            img_current = _silent_call(cargar_imagen, args.image)

            # Aplicar ROI a ambas imágenes igual
            if roi and roi.get("w", 0) > 0 and roi.get("h", 0) > 0:
                x, y, w, h = int(roi["x"]), int(roi["y"]), int(roi["w"]), int(roi["h"])
                if x + w <= img_base.shape[1] and y + h <= img_base.shape[0]:
                    img_base = img_base[y:y+h, x:x+w]
                    img_current = img_current[y:y+h, x:x+w]

            # Comparar
            comparison = comparar_imagenes(img_base, img_current)

            # También ejecutar pipeline de captura para la imagen actual
            capture_result = run_capture_pipeline(args.image, roi)

            result = {
                "zoneId": "talud-maqueta-01",
                "comparison": comparison,
                "cracks": capture_result["cracks"],
                "spacing": capture_result["spacing"],
                "imageBase64": comparison["overlay_base64"],
                "total_fisuras": capture_result["total_fisuras"],
                "total_length_cm": capture_result["total_length_cm"],
                "familias": capture_result["familias"],
            }
            print(json.dumps(result, indent=2, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "error_type": type(e).__name__,
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
