

import argparse
import base64
import contextlib
import csv
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

with contextlib.redirect_stdout(open(os.devnull, 'w', encoding='utf-8')):
    # Importar funciones del pipeline principal
    from pipeline_maqueta import (
    MAQUETA_ANCHO_CM, MAQUETA_ALTO_CM, CM_POR_PX, IMG_W, IMG_H,
    corregir_perspectiva, cargar_imagen, capturar_camara,
    generar_mascara_binaria, limpiar_mascara, eliminar_bordes,
    eliminar_linea_horizontal, detectar_desprendimientos,
    obtener_skeleton, extraer_segmentos, fusionar_segmentos,
    clasificar_familias_angulares, MIN_LENGTH_CM,
    guardar_resultados,
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


def _get_skeleton(img: np.ndarray) -> np.ndarray:
    """Extrae el skeleton de una imagen aplicando el mismo pipeline que la maqueta."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mask = generar_mascara_binaria(gray)
    mask = limpiar_mascara(mask)
    mask = eliminar_bordes(mask)
    mask = eliminar_linea_horizontal(mask)
    mask_sin, _ = detectar_desprendimientos(mask, img.shape[0], img.shape[1])
    skel = obtener_skeleton(mask_sin)
    return skel


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

    # =====================================================================
    # Generación de la Comparación de Skeletons (Base Rojo vs Current Verde)
    # =====================================================================
    # 1. Obtener skeletons
    skel_base = _get_skeleton(img_base)
    skel_reg = _get_skeleton(img_reg)

    # 2. Crear canvas oscuro (para que resalten los skeletons)
    comp_skels = (img_base * 0.2).astype(np.uint8)

    # 3. Dibujar skeleton base en rojo (BGR: 0, 0, 255)
    comp_skels[skel_base > 0] = (0, 0, 255)
    
    # 4. Dibujar skeleton actual registrado en verde (BGR: 0, 255, 0)
    comp_skels[skel_reg > 0] = (0, 255, 0)

    # 5. Codificar en base64 para enviarlo al frontend como registered_base64
    _, buf_reg = cv2.imencode(".jpg", comp_skels)
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

def run_capture_pipeline(image_path: str, roi: dict = None,
                         output_dir: Path = None, analysis_id: str = None):
    """
    Ejecuta el pipeline completo de detección de fisuras sobre una imagen.
    Guarda las imágenes diagnósticas a disco y devuelve dict con resultados + paths.

    Args:
        image_path: Ruta a la imagen a analizar
        roi: ROI opcional {x, y, w, h}
        output_dir: Directorio donde guardar las imágenes (si es None, no guarda)
        analysis_id: ID único del análisis (genera UUID si no se provee)

    Returns:
        dict con resultados, paths de imágenes, análisis
    """
    if analysis_id is None:
        analysis_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()

    # Cargar imagen (silenciando prints)
    img = _silent_call(cargar_imagen, image_path)

    # Aplicar ROI si se especifica
    if roi and roi.get("w", 0) > 0 and roi.get("h", 0) > 0:
        x, y, w, h = int(roi["x"]), int(roi["y"]), int(roi["w"]), int(roi["h"])
        # Clampear coordenadas a límites válidos de la imagen
        x = max(0, min(x, img.shape[1] - 1))
        y = max(0, min(y, img.shape[0] - 1))
        w = min(w, img.shape[1] - x)
        h = min(h, img.shape[0] - y)
        if w > 0 and h > 0:
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

    # Generar overlay
    overlay_img = _generar_overlay(img_corregida, active_fisuras, desprendimientos, skeleton)

    # Guardar imágenes a disco si se especificó output_dir
    saved_paths = {}
    if output_dir is not None:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Guardar las 4 imágenes diagnósticas usando guardar_resultados
        # Necesitamos img_tabla para guardar_resultados (similar a overlay_img pero con tabla)
        # Por ahora usamos overlay_img como img_tabla
        _silent_call(guardar_resultados, output_dir, img, img_corregida,
                     mask_sin_desprendimientos, skeleton, overlay_img, overlay_img,
                     fisuras, desprendimientos)

        # También codificar overlay a base64 para respuesta inline
        _, buffer = cv2.imencode(".jpg", overlay_img)
        overlay_b64 = base64.b64encode(buffer).decode("ascii")

        saved_paths = {
            "calibrada": str(output_dir / "01_imagen_calibrada.jpg"),
            "mask": str(output_dir / "02_mask_binaria_limpia.jpg"),
            "skeleton": str(output_dir / "03_skeleton.jpg"),
            "familias_overlay": str(output_dir / "04_familias_overlay_2d.jpg"),
        }
        csv_path = str(output_dir / "resultados_familias.csv")
        json_path = str(output_dir / "resumen.json")
    else:
        # Solo codificar overlay a base64 si no hay output_dir
        _, buffer = cv2.imencode(".jpg", overlay_img)
        overlay_b64 = base64.b64encode(buffer).decode("ascii")
        csv_path = None
        json_path = None

    # Preparar fisuras para JSON
    fisuras_json = []
    for f in active_fisuras:
        entry = {k: v for k, v in f.items() if k != "pixel_mask"}
        entry["angle_deg"] = entry.pop("angle", 0)
        fisuras_json.append(entry)

    result = {
        "success": True,
        "analysis_id": analysis_id,
        "timestamp": timestamp,
        "type": "base",
        "zoneId": "talud-maqueta-01",
        "summary": {
            "total_fisuras": len(active_fisuras),
            "longitud_total_cm": round(total_cm, 1),
            "familias": familias_stats,
        },
        "images": saved_paths,
        "cracks": [_fisura_to_frontend(f) for f in active_fisuras],
        "spacing": _calc_spacing(active_fisuras, familias_stats),
        "imageBase64": overlay_b64 if not output_dir else None,
        "total_fisuras": len(active_fisuras),
        "total_length_cm": round(total_cm, 1),
        "familias": familias_stats,
        "desprendimientos": desprendimientos,
        "fisuras_raw": fisuras_json,
        "csv": csv_path,
        "json": json_path,
    }
    return result


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
        # ── Directorio base de salida ──────────────────────────────────
        output_root = SCRIPT_DIR / "output"
        output_root.mkdir(parents=True, exist_ok=True)

        # ── CAPTURE ──────────────────────────────────────────────────
        if args.command == "capture":
            if not args.image and args.camera is None:
                # Buscar imagen por defecto
                default_img = SCRIPT_DIR / ".." / "edge" / "calibration" / "calib_images" / "Imagen1.jpeg"
                if default_img.exists():
                    args.image = str(default_img)
                else:
                    print(json.dumps({"error": "No se especificó imagen ni cámara"}))
                    sys.exit(1)

            if args.camera is not None:
                img = _silent_call(capturar_camara, args.camera)
                temp_path = str(output_root / "_capture_temp.jpg")
                cv2.imwrite(temp_path, img)
                args.image = temp_path

            # Crear directorio con timestamp para este análisis
            analysis_id = str(uuid.uuid4())
            out_dir = output_root / "current" / analysis_id
            result = run_capture_pipeline(args.image, roi, output_dir=out_dir, analysis_id=analysis_id)
            result["type"] = "current"
            print(json.dumps(result, indent=2, ensure_ascii=False))

        # ── SAVE BASE ────────────────────────────────────────────────
        elif args.command == "save_base":
            if not args.image and args.camera is None:
                print(json.dumps({"error": "No se especificó imagen"}))
                sys.exit(1)

            if args.camera is not None:
                img = _silent_call(capturar_camara, args.camera)
            else:
                img = _silent_call(cargar_imagen, args.image)

            # Guardar imagen base raw
            base_ref_path = str(output_root / "_base_ref.jpg")
            cv2.imwrite(base_ref_path, img)

            # También ejecutar análisis completo sobre la base
            analysis_id = str(uuid.uuid4())
            out_dir = output_root / "base" / analysis_id
            analysis = run_capture_pipeline(args.image, roi, output_dir=out_dir, analysis_id=analysis_id)

            print(json.dumps({
                "success": True,
                "message": "Imagen base guardada y analizada",
                "isBaseImage": True,
                "isBaseImageSaved": True,
                "zoneId": "talud-maqueta-01",
                "base_ref_path": base_ref_path,
                **analysis,
            }, indent=2, ensure_ascii=False))

        # ── COMPARE ──────────────────────────────────────────────────
        elif args.command == "compare":
            if not args.image and args.camera is None:
                print(json.dumps({"error": "No se especificó imagen actual"}))
                sys.exit(1)

            # Buscar imagen base
            base_path = args.base or str(output_root / "_base_ref.jpg")
            if not Path(base_path).exists():
                print(json.dumps({
                    "error": "No hay imagen base guardada. Ejecutá 'save_base' primero.",
                    "code": "NO_BASE_IMAGE"
                }))
                sys.exit(1)

            if args.camera is not None:
                img = _silent_call(capturar_camara, args.camera)
                temp_path = str(output_root / "_compare_temp.jpg")
                cv2.imwrite(temp_path, img)
                args.image = temp_path

            img_base = _silent_call(cargar_imagen, base_path)
            img_current = _silent_call(cargar_imagen, args.image)

            # Aplicar ROI a ambas imágenes igual
            if roi and roi.get("w", 0) > 0 and roi.get("h", 0) > 0:
                x, y, w, h = int(roi["x"]), int(roi["y"]), int(roi["w"]), int(roi["h"])
                x = max(0, min(x, img_base.shape[1] - 1))
                y = max(0, min(y, img_base.shape[0] - 1))
                w = min(w, img_base.shape[1] - x)
                h = min(h, img_base.shape[0] - y)
                if w > 0 and h > 0:
                    img_base = img_base[y:y+h, x:x+w]
                    img_current = img_current[y:y+h, x:x+w]

            # IDs únicos
            base_analysis_id = str(uuid.uuid4())
            current_analysis_id = str(uuid.uuid4())
            comparison_id = str(uuid.uuid4())
            timestamp = datetime.now(timezone.utc).isoformat()

            # Ejecutar análisis sobre imagen actual
            current_out_dir = output_root / "current" / current_analysis_id
            capture_result = run_capture_pipeline(args.image, roi, output_dir=current_out_dir, analysis_id=current_analysis_id)

            # Comparar
            comparison = comparar_imagenes(img_base, img_current)

            # Guardar imágenes de comparación
            comp_out_dir = output_root / "comparison" / comparison_id
            comp_out_dir.mkdir(parents=True, exist_ok=True)

            # Decodificar base64 de comparación y guardar
            if comparison.get("overlay_base64"):
                overlay_bytes = base64.b64decode(comparison["overlay_base64"])
                with open(comp_out_dir / "comparacion_final.jpg", "wb") as f:
                    f.write(overlay_bytes)

            if comparison.get("diff_mask_base64"):
                diff_bytes = base64.b64decode(comparison["diff_mask_base64"])
                with open(comp_out_dir / "comparacion_original.jpg", "wb") as f:
                    f.write(diff_bytes)

            if comparison.get("registered_base64"):
                reg_bytes = base64.b64decode(comparison["registered_base64"])
                with open(comp_out_dir / "comparacion_skeletons.jpg", "wb") as f:
                    f.write(reg_bytes)

            # También generar overlay de solo diferencias (topleft)
            if comparison.get("diff_mask_base64") and comparison.get("overlay_base64"):
                # Usamos la overlay como topleft también
                with open(comp_out_dir / "comparacion_topleft.jpg", "wb") as f:
                    f.write(overlay_bytes)

            result = {
                "success": True,
                "comparison_id": comparison_id,
                "base_analysis_id": base_analysis_id,
                "current_analysis_id": current_analysis_id,
                "timestamp": timestamp,
                "zoneId": "talud-maqueta-01",
                "summary": {
                    "fisuras_base": capture_result["summary"]["total_fisuras"],
                    "fisuras_actual": capture_result["summary"]["total_fisuras"],
                    "longitud_base_cm": capture_result["summary"]["longitud_total_cm"],
                    "longitud_actual_cm": capture_result["summary"]["longitud_total_cm"],
                    "diferencia_fisuras": 0,
                    "diferencia_longitud_cm": 0,
                },
                "images": {
                    "comparacion_original": str(comp_out_dir / "comparacion_original.jpg"),
                    "comparacion_final": str(comp_out_dir / "comparacion_final.jpg"),
                    "comparacion_skeletons": str(comp_out_dir / "comparacion_skeletons.jpg"),
                    "comparacion_topleft": str(comp_out_dir / "comparacion_topleft.jpg"),
                },
                "comparison": comparison,
                "cracks": capture_result["cracks"],
                "spacing": capture_result["spacing"],
                "total_fisuras": capture_result["total_fisuras"],
                "total_length_cm": capture_result["total_length_cm"],
                "familias": capture_result["familias"],
                "current_analysis": {
                    "images": capture_result["images"],
                    "summary": capture_result["summary"],
                    "csv": capture_result.get("csv"),
                    "json": capture_result.get("json"),
                },
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
