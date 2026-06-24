"""
PIPELINE MEJORADO DE DETECCIÓN DE FISURAS Y DESPRENDIMIENTOS — ARGOS SLOPE 4.0
================================================================================

Pipeline completo 2D para maqueta de talud (100 cm × 80 cm).
Detección de fisuras (con clasificación por familias angulares)
y desprendimientos mediante esqueletización y análisis de segmentos.

FLUJO:
  1. Cargar imagen (archivo o cámara)
  2. Corregir perspectiva → 1000×800 px
  3. Adaptive threshold → máscara binaria
  4. Limpiar máscara (morfología + bordes + líneas horizontales)
  5. Detectar desprendimientos y removerlos de la máscara
  6. Esqueletizar (thinning Zhang-Suen)
  7. Extraer segmentos del esqueleto (análisis de bifurcaciones)
  8. Fusionar segmentos cercanos y colineales → fisuras
  9. Clasificar por familias angulares (F1: 15-85deg, F2: 95-165deg)
  10. Dibujar overlay 4-capas + tabla de resultados
  11. Guardar resultados (4 imágenes + CSV + JSON)

USO:
    python diagnostics/pipeline_maqueta.py                     # usa Imagen1.jpeg
    python diagnostics/pipeline_maqueta.py --imagen ruta.jpg   # otra imagen
    python diagnostics/pipeline_maqueta.py --camara 0          # cámara en vivo

SALIDA (edge/diagnostics/output/):
    - 01_imagen_calibrada.jpg
    - 02_mask_binaria_limpia.jpg
    - 03_skeleton.jpg
    - 04_familias_overlay_2d.jpg
    - resultados_familias.csv
    - resumen.json
"""

import argparse
import csv
import json
import sys
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

# =====================================================================
#  PARÁMETROS CONFIGURABLES
# =====================================================================

# Dimensiones reales de la maqueta (cm)
MAQUETA_ANCHO_CM = 100.0
MAQUETA_ALTO_CM = 80.0

# Tamaño de la imagen corregida (px)
IMG_W = 1000
IMG_H = 800
CM_POR_PX = MAQUETA_ANCHO_CM / IMG_W  # 0.1 cm/px

# Adaptive threshold
ADAPTIVE_BLOCK_SIZE = 31
ADAPTIVE_C = 8

# Morfología
MORPH_KERNEL = (3, 3)
CLOSE_ITERATIONS = 1
OPEN_ITERATIONS = 1
DILATE_ITERATIONS = 0

# Filtros de componentes
MIN_AREA = 80
MIN_LENGTH_PX = 15
MIN_LENGTH_CM = 3.0
MIN_ASPECT_RATIO = 1.8

# Merging de segmentos
MERGE_ANGLE_TOLERANCE = 10
MERGE_DISTANCE_TOLERANCE_PX = 25
MERGE_ENDPOINT_DISTANCE_PX = 18
MERGE_GAP_PX = 30

# Ignorar línea horizontal del tablero
IGNORE_HORIZONTAL_ANGLE = 10
IGNORE_LONG_HORIZONTAL_WIDTH_RATIO = 0.65
IGNORE_LONG_HORIZONTAL_HEIGHT_PX = 30

# Detección de desprendimientos
DETACH_MIN_AREA = 1200
DETACH_MIN_W = 60
DETACH_MIN_H = 40
DETACH_MIN_DENSITY = 0.12
DETACH_MAX_ASPECT = 5.5
DETACH_CLOSE_KERNEL = (7, 7)
DETACH_CLOSE_ITERATIONS = 1
DETACH_DILATE_ITERATIONS = 1

# Bordes
BORDER_MARGIN = 5

# Output
OUTPUT_DIR = Path(__file__).resolve().parent / "output"
DEF_IMG = Path(__file__).resolve().parents[1] / "edge" / "calibration" / "calib_images" / "Imagen1.jpeg"


# =====================================================================
#  FUNCIONES DEL PIPELINE
# =====================================================================

def cargar_imagen(ruta: str) -> np.ndarray:
    """Carga una imagen desde archivo."""
    img = cv2.imread(ruta)
    if img is None:
        raise FileNotFoundError(f"No se pudo cargar la imagen: {ruta}")
    print(f"📷 Imagen cargada: {Path(ruta).name} ({img.shape[1]}x{img.shape[0]})")
    return img


def capturar_camara(indice: int = 0) -> np.ndarray:
    """Captura un frame desde la cámara."""
    cap = cv2.VideoCapture(indice)
    if not cap.isOpened():
        raise RuntimeError(f"No se pudo abrir la cámara {indice}")
    # Dar tiempo para que se ajuste
    time.sleep(0.5)
    ret, frame = cap.read()
    cap.release()
    if not ret:
        raise RuntimeError("No se pudo capturar el frame")
    print(f"📷 Captura desde cámara {indice}: {frame.shape[1]}x{frame.shape[0]}")
    return frame


def corregir_perspectiva(img: np.ndarray, pts: Optional[list] = None,
                         salida_w: int = IMG_W, salida_h: int = IMG_H) -> np.ndarray:
    """
    Corrige perspectiva de la maqueta usando 4 puntos de esquina.
    pts: [(x1,y1), (x2,y2), (x3,y3), (x4,y4)] en orden: TL, TR, BR, BL
    Si pts es None, redimensiona directamente a salida_w x salida_h.
    """
    if pts is None:
        return cv2.resize(img, (salida_w, salida_h), interpolation=cv2.INTER_AREA)

    pts = np.array(pts, dtype=np.float32)
    dst = np.array([
        [0, 0],
        [salida_w - 1, 0],
        [salida_w - 1, salida_h - 1],
        [0, salida_h - 1],
    ], dtype=np.float32)

    M = cv2.getPerspectiveTransform(pts, dst)
    corregida = cv2.warpPerspective(img, M, (salida_w, salida_h),
                                     flags=cv2.INTER_LINEAR)
    print(f"🔄 Perspectiva corregida → {salida_w}x{salida_h}")
    return corregida


def generar_mascara_binaria(gray: np.ndarray) -> np.ndarray:
    """
    Detecta fisuras oscuras sobre fondo claro usando adaptive threshold.
    Retorna máscara binaria (255 = fisura, 0 = fondo).
    """
    # Desenfoque suave
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # CLAHE para mejorar contraste local
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(blurred)

    # Adaptive threshold
    binary = cv2.adaptiveThreshold(
        enhanced, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        ADAPTIVE_BLOCK_SIZE,
        ADAPTIVE_C,
    )
    return binary


def limpiar_mascara(mask: np.ndarray) -> np.ndarray:
    """
    Aplica morfología para limpiar la máscara:
    - CLOSE: unir cortes pequeños en las líneas
    - OPEN: eliminar ruido pequeño
    - DILATE: unir fragmentos cercanos
    """
    kernel = np.ones(MORPH_KERNEL, dtype=np.uint8)

    cleaned = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=CLOSE_ITERATIONS)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel, iterations=OPEN_ITERATIONS)
    cleaned = cv2.dilate(cleaned, kernel, iterations=DILATE_ITERATIONS)

    return cleaned


def eliminar_bordes(mask: np.ndarray) -> np.ndarray:
    """
    Elimina pequenhos artefactos que tocan los bordes de la imagen.
    
    Usa floodFill para encontrar el background conectado al borde, luego
    remueve solo componentes FOREGROUND pequenhos (<200px) que esten en el
    margen del borde. No remueve fisuras grandes que naturalmente llegan
    hasta el borde de la maqueta.
    """
    h, w = mask.shape
    
    # Encontrar foreground components via CC
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    result = np.zeros_like(mask)
    count_removed = 0
    for i in range(1, num_labels):
        x, y, cw, ch, area = stats[i]
        
        # Verificar si toca el borde (pixel level)
        component_mask = (labels == i)
        ys, xs = np.where(component_mask)
        touches_border = np.any(xs <= BORDER_MARGIN) or np.any(ys <= BORDER_MARGIN) or \
                         np.any(xs >= w - BORDER_MARGIN - 1) or np.any(ys >= h - BORDER_MARGIN - 1)
        
        if touches_border and area < 200:
            # Solo remover artefactos PEQUENHOS que tocan el borde
            count_removed += 1
        else:
            result[labels == i] = 255
    
    if count_removed > 0:
        print(f"   Artefactos pequenos en borde eliminados: {count_removed}")
    return result


def eliminar_linea_horizontal(mask: np.ndarray) -> np.ndarray:
    """
    Elimina líneas horizontales largas (como división del tablero).
    Ahora también verifica ángulo via fitLine para no eliminar grietas anchas anguladas.
    """
    h, w = mask.shape
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    result = mask.copy()
    for cnt in contours:
        x, y, cw, ch = cv2.boundingRect(cnt)
        if cw > w * IGNORE_LONG_HORIZONTAL_WIDTH_RATIO and ch < IGNORE_LONG_HORIZONTAL_HEIGHT_PX:
            # Also check angle
            if len(cnt) >= 5:
                [vx, vy, xx, yy] = cv2.fitLine(cnt, cv2.DIST_L2, 0, 0.01, 0.01)
                angle = np.degrees(np.arctan2(float(vy[0]), float(vx[0]))) % 180
                if angle > 180 - IGNORE_HORIZONTAL_ANGLE or angle < IGNORE_HORIZONTAL_ANGLE:
                    cv2.drawContours(result, [cnt], -1, 0, -1)
                    print(f"   🚫 Linea horizontal eliminada: ({x},{y}) {cw}x{ch} ang={angle:.0f}deg")
            else:
                cv2.drawContours(result, [cnt], -1, 0, -1)
    return result


def obtener_skeleton(mask: np.ndarray) -> np.ndarray:
    """
    Obtiene el esqueleto (thinning Zhang-Suen) de la máscara.
    """
    try:
        skeleton = cv2.ximgproc.thinning(mask, thinningType=cv2.ximgproc.THINNING_ZHANGSUEN)
    except AttributeError:
        # Fallback manual
        skeleton = _skeletonize_manual(mask)
    return skeleton


def _skeletonize_manual(img: np.ndarray) -> np.ndarray:
    """Fallback manual de skeletonización."""
    size = np.size(img)
    skel = np.zeros(img.shape, dtype=np.uint8)
    ret, img_bin = cv2.threshold(img, 127, 255, 0)
    element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    done = False
    while not done:
        eroded = cv2.erode(img_bin, element)
        temp = cv2.dilate(eroded, element)
        temp = cv2.subtract(img_bin, temp)
        skel = cv2.bitwise_or(skel, temp)
        img_bin = eroded.copy()
        zeros = size - cv2.countNonZero(img_bin)
        if zeros == size:
            done = True
    return skel


# =====================================================================
#  DETECCION DE DESPRENDIMIENTOS Y SEGMENTOS
# =====================================================================


def detectar_desprendimientos(mask: np.ndarray, img_h: int, img_w: int) -> tuple:
    """
    Detecta zonas de desprendimiento mediante analisis de densidad por bloques.
    
    En vez de morphological close (que une toda la red de fisuras en un blob),
    divide la mascara en bloques y calcula densidad de pixeles de fisura en cada uno.
    Los bloques con alta densidad se agrupan en regiones de desprendimiento.
    
    Retorna (mask_sin_desprendimientos, lista_desprendimientos)
    """
    TILE_SIZE = 40  # px por bloque
    DENSITY_THRESHOLD = 0.50  # 50%+ cobertura en bloque 40x40 = alta densidad
    
    h, w = mask.shape
    nx = max(1, w // TILE_SIZE)
    ny = max(1, h // TILE_SIZE)
    
    # Calcular densidad por bloque
    density_map = np.zeros((ny, nx), dtype=np.float32)
    for ty in range(ny):
        for tx in range(nx):
            y1 = ty * TILE_SIZE
            x1 = tx * TILE_SIZE
            y2 = min(y1 + TILE_SIZE, h)
            x2 = min(x1 + TILE_SIZE, w)
            tile = mask[y1:y2, x1:x2]
            density_map[ty, tx] = cv2.countNonZero(tile) / ((y2 - y1) * (x2 - x1))
    
    # Bloques de alta densidad (sin agrupar — solo CC directa)
    high_density = (density_map > DENSITY_THRESHOLD).astype(np.uint8) * 255
    
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(high_density, connectivity=8)
    
    desprendimientos = []
    mask_clean = mask.copy()
    
    for i in range(1, num_labels):
        # Convertir coordenadas de bloques a pixeles
        by, bx = np.where(labels == i)
        if len(by) == 0:
            continue
        
        y1 = int(by.min()) * TILE_SIZE
        x1 = int(bx.min()) * TILE_SIZE
        y2 = int((by.max() + 1) * TILE_SIZE)
        x2 = int((bx.max() + 1) * TILE_SIZE)
        y2 = min(y2, h)
        x2 = min(x2, w)
        
        cw = x2 - x1
        ch = y2 - y1
        area = cw * ch
        
        # Area real de fisura dentro de esta region
        region = mask[y1:y2, x1:x2]
        fisura_px = cv2.countNonZero(region)
        density = fisura_px / area if area > 0 else 0
        
        # Filtros
        if (area > DETACH_MIN_AREA and cw > DETACH_MIN_W and ch > DETACH_MIN_H
                and density > DETACH_MIN_DENSITY):
            ar = max(cw, ch) / max(min(cw, ch), 1)
            if ar < DETACH_MAX_ASPECT and cw < img_w * 0.5 and ch < img_h * 0.3:
                d_id = f"D{len(desprendimientos) + 1}"
                desprendimientos.append({
                    "id": d_id,
                    "x": int(x1), "y": int(y1),
                    "width": int(cw), "height": int(ch),
                    "area_px": int(fisura_px),
                    "area_cm2": round(fisura_px * CM_POR_PX * CM_POR_PX, 1),
                    "density": round(density, 2),
                })
                # Remover solo los pixeles de fisura dentro de la zona
                mask_clean[y1:y2, x1:x2] = 0
                print(f"   Desprendimiento {d_id}: ({x1},{y1}) {cw}x{ch} density={density:.2f} px_removed={fisura_px}")
    
    if desprendimientos:
        print(f"   Total desprendimientos: {len(desprendimientos)}")
    else:
        print("   No se detectaron zonas de desprendimiento")
    return mask_clean, desprendimientos





def partir_en_junctions(skel_patch: np.ndarray) -> list:
    """
    Divide un segmento de esqueleto en sus ramas constituyentes,
    detectando puntos de bifurcacion (3+ vecinos).
    
    Retorna lista de mascaras binarias (una por rama) solo si hay
    suficientes junctions para justificar la particion.
    """
    h, w = skel_patch.shape[:2]
    binary = (skel_patch > 0).astype(np.uint8)
    
    # Encontrar junctions solo en el skeleton original (sin dilatar)
    junction_mask = np.zeros_like(binary)
    for py in range(1, h - 1):
        for px in range(1, w - 1):
            if binary[py, px]:
                nb = np.count_nonzero(binary[py-1:py+2, px-1:px+2]) - 1
                if nb >= 3:
                    junction_mask[py, px] = 1
    
    n_junct = np.count_nonzero(junction_mask)
    total_px = np.count_nonzero(binary)
    if n_junct < 5:
        return [skel_patch]  # devolver intacto
    
    # Remover solo el pixel exacto de junction (SIN dilatar ni reconectar)
    branches = binary.copy()
    branches[junction_mask > 0] = 0
    
    # CC directamente sobre las ramas (sin dilation adicional)
    num_labels, labels = cv2.connectedComponents(branches, connectivity=8)
    print(f"      Junctions: {n_junct} -> {num_labels} labels")
    
    masks = []
    for i in range(1, num_labels):
        mask = (labels == i).astype(np.uint8)
        # Medir usando el skeleton original
        original_px = cv2.countNonZero(cv2.bitwise_and(binary, mask))
        if original_px >= 15:  # min 15px para rama valida
            mask_255 = (mask * 255).astype(np.uint8)
            masks.append(mask_255)
    
    # Si la particion no mejoro, devolver original
    if len(masks) <= 2:
        return [skel_patch]
    
    return masks


def extraer_segmentos(skeleton: np.ndarray) -> list:
    """
    Extrae segmentos del esqueleto usando CC directo (sin dilation previa).
    
    Como el skeleton es 1px, las CC naturales son ramas individuales.
    Componentes gigantes (span >60% ancho) se parten en junctions.
    
    Retorna lista de segmentos individuales.
    """
    h, w = skeleton.shape[:2]
    skel = skeleton.copy()
    
    # Componentes conectados DIRECTAMENTE sobre skeleton 1px (sin dilation)
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
        skel, connectivity=8
    )
    
    segments = []
    giant_split_count = 0
    for i in range(1, num_labels):
        x, y, cw, ch, area = stats[i]
        
        # Filtrar linea horizontal divisoria del tablero
        if cw > w * IGNORE_LONG_HORIZONTAL_WIDTH_RATIO and ch < IGNORE_LONG_HORIZONTAL_HEIGHT_PX:
            continue
        
        # Crear mascara del componente usando el esqueleto ORIGINAL
        component_mask = (labels == i).astype(np.uint8) * 255
        segment_skel = cv2.bitwise_and(skel, component_mask)
        length_px = cv2.countNonZero(segment_skel)
        
        # Saltar segmentos muy cortos
        if length_px < MIN_LENGTH_PX:
            continue
        
        # Segmentos gigantes: partir en junctions
        if cw > w * 0.6:
            branches = partir_en_junctions(segment_skel)
            if len(branches) <= 1:
                # No se pudo partir, descartar
                continue
            giant_split_count += 1
            # Procesar cada rama como segmento individual
            for branch_mask in branches:
                # Verificar que tenga suficiente longitud en skel original
                branch_px = cv2.countNonZero(cv2.bitwise_and(skel, branch_mask))
                if branch_px < MIN_LENGTH_PX:
                    continue
                
                # Fit line
                pts = np.column_stack(np.where(branch_mask > 0))
                if len(pts) < 5:
                    angle = 0.0
                else:
                    pts_xy = np.fliplr(pts).astype(np.float32)
                    try:
                        [vx, vy, xx, yy] = cv2.fitLine(pts_xy, cv2.DIST_L2, 0, 0.01, 0.01)
                        angle = float(np.degrees(np.arctan2(float(vy[0]), float(vx[0]))) % 180)
                    except cv2.error:
                        angle = 0.0
                
                # Bbox
                bys, bxs = np.where(branch_mask > 0)
                bx, by = bxs.min(), bys.min()
                bw, bh = bxs.max() - bx + 1, bys.max() - by + 1
                
                # Endpoints (vectorizado con OpenCV)
                kernel = np.ones((3, 3), dtype=np.float32)
                kernel[1, 1] = 0
                nb = cv2.filter2D(branch_mask.astype(np.float32), -1, kernel)
                endpoint_mask = ((branch_mask > 0) & (nb <= 1)).astype(np.uint8) * 255
                
                end_pts = np.column_stack(np.where(endpoint_mask > 0))
                if len(end_pts) >= 2:
                    max_d = 0
                    best_pair = ((int(end_pts[0, 1]), int(end_pts[0, 0])),
                                 (int(end_pts[-1, 1]), int(end_pts[-1, 0])))
                    for ei in range(len(end_pts)):
                        for ej in range(ei + 1, len(end_pts)):
                            d = np.sqrt((end_pts[ei, 1] - end_pts[ej, 1])**2 +
                                        (end_pts[ei, 0] - end_pts[ej, 0])**2)
                            if d > max_d:
                                max_d = d
                                best_pair = ((int(end_pts[ei, 1]), int(end_pts[ei, 0])),
                                             (int(end_pts[ej, 1]), int(end_pts[ej, 0])))
                else:
                    best_pair = ((int(bx + bw//2), int(by + bh//2)),
                                 (int(bx + bw//2), int(by + bh//2)))
                
                segments.append({
                    "id": len(segments) + 1,
                    "angle": round(angle, 1),
                    "length_px": int(branch_px),
                    "endpoints": list(best_pair),
                    "centroid": (int(bx + bw//2), int(by + bh//2)),
                    "pixel_mask": branch_mask,
                    "bbox": (int(bx), int(by), int(bw), int(bh)),
                })
        else:
            # Segmento normal — procesar directo
            # Fit line para angulo
            pts = np.column_stack(np.where(segment_skel > 0))
            if len(pts) < 5:
                angle = 0.0
            else:
                pts_xy = np.fliplr(pts).astype(np.float32)
                try:
                    [vx, vy, xx, yy] = cv2.fitLine(pts_xy, cv2.DIST_L2, 0, 0.01, 0.01)
                    angle = float(np.degrees(np.arctan2(float(vy[0]), float(vx[0]))) % 180)
                except cv2.error:
                    angle = 0.0
            
            # Endpoints (vectorizado con OpenCV)
            kernel = np.ones((3, 3), dtype=np.float32)
            kernel[1, 1] = 0
            nb = cv2.filter2D(segment_skel.astype(np.float32), -1, kernel)
            endpoint_mask = ((segment_skel > 0) & (nb <= 1)).astype(np.uint8) * 255
            
            end_pts = np.column_stack(np.where(endpoint_mask > 0))
            if len(end_pts) >= 2:
                max_dist = 0
                best_pair = ((int(end_pts[0, 1]), int(end_pts[0, 0])),
                             (int(end_pts[-1, 1]), int(end_pts[-1, 0])))
                for ei in range(len(end_pts)):
                    for ej in range(ei + 1, len(end_pts)):
                        d = np.sqrt((end_pts[ei, 1] - end_pts[ej, 1])**2 +
                                    (end_pts[ei, 0] - end_pts[ej, 0])**2)
                        if d > max_dist:
                            max_dist = d
                            best_pair = ((int(end_pts[ei, 1]), int(end_pts[ei, 0])),
                                         (int(end_pts[ej, 1]), int(end_pts[ej, 0])))
            else:
                cx, cy = int(centroids[i][0]), int(centroids[i][1])
                best_pair = ((cx, cy), (cx, cy))
            
            centroid = (int(centroids[i][0]), int(centroids[i][1]))
            
            segments.append({
                "id": len(segments) + 1,
                "angle": round(angle, 1),
                "length_px": length_px,
                "endpoints": list(best_pair),
                "centroid": centroid,
                "pixel_mask": segment_skel,
                "bbox": (int(x), int(y), int(cw), int(ch)),
            })
    
    if giant_split_count:
        print(f"   Partidos {giant_split_count} componentes gigantes en junctions")
    
    print(f"   Segmentos extraidos del skeleton: {len(segments)}")
    return segments


def fusionar_segmentos(segments: list, img_w: int, img_h: int) -> list:
    """
    Fusiona segmentos cercanos y colineales en fisuras completas.
    
    4 criterios de merge (cualquiera dispara la fusion):
    1. Diferencia de angulo <= MERGE_ANGLE_TOLERANCE
       Y distancia entre centroides <= MERGE_DISTANCE_TOLERANCE_PX
    2. Proximidad de endpoints <= MERGE_ENDPOINT_DISTANCE_PX
    3. Casi colineales con gap <= MERGE_GAP_PX
    
    Retorna lista de fisuras fusionadas.
    """
    if len(segments) <= 1:
        return _segments_to_fissures(segments)
    
    # Group segments by proximity using iterative expansion
    # Each s2 is checked against ALL members of the current group (not just s1)
    used = set()
    grupos = []
    
    for i, s1 in enumerate(segments):
        if i in used:
            continue
        
        grupo = [s1]
        used.add(i)
        
        # Keep scanning until no more segments can join this group
        changed = True
        while changed:
            changed = False
            for j, s2 in enumerate(segments):
                if j in used:
                    continue
                
                # Check s2 against ALL members of the current group
                should_merge = False
                for gm in grupo:
                    # Criterion 1: Angle diff + centroid distance
                    ang_diff = abs(gm["angle"] - s2["angle"])
                    ang_diff = min(ang_diff, 180 - ang_diff)
                    
                    dx = gm["centroid"][0] - s2["centroid"][0]
                    dy = gm["centroid"][1] - s2["centroid"][1]
                    centroid_dist = np.sqrt(dx**2 + dy**2)
                    
                    # Criterion 2: Endpoint proximity
                    min_endpoint_dist = float('inf')
                    for e1 in gm["endpoints"]:
                        for e2 in s2["endpoints"]:
                            ed = np.sqrt((e1[0] - e2[0])**2 + (e1[1] - e2[1])**2)
                            min_endpoint_dist = min(min_endpoint_dist, ed)
                    
                    # Criterion 3: Colinearity gap
                    collinear = False
                    if ang_diff < 15:
                        for e1 in gm["endpoints"]:
                            for e2 in s2["endpoints"]:
                                dist_between = np.sqrt((e1[0] - e2[0])**2 + (e1[1] - e2[1])**2)
                                if dist_between < MERGE_GAP_PX:
                                    collinear = True
                                    break
                            if collinear:
                                break
                    
                    # Any criterion met = merge
                    if ang_diff < MERGE_ANGLE_TOLERANCE and centroid_dist < MERGE_DISTANCE_TOLERANCE_PX:
                        should_merge = True
                        break
                    elif min_endpoint_dist < MERGE_ENDPOINT_DISTANCE_PX:
                        should_merge = True
                        break
                    elif collinear and min_endpoint_dist < MERGE_GAP_PX:
                        should_merge = True
                        break
                
                if should_merge:
                    grupo.append(s2)
                    used.add(j)
                    changed = True
        
        if len(grupo) > 1:
            grupos.append(grupo)
        else:
            grupos.append(grupo)
    
    # Convert groups to fissures
    fissures = []
    for grupo in grupos:
        if len(grupo) == 1:
            s = grupo[0]
            fissures.append({
                "id": f"F{len(fissures) + 1}",
                "segment_ids": [s["id"]],
                "angle": s["angle"],
                "length_px": s["length_px"],
                "length_cm": round(s["length_px"] * CM_POR_PX, 1),
                "x": s["bbox"][0], "y": s["bbox"][1],
                "width": s["bbox"][2], "height": s["bbox"][3],
                "centroid": s["centroid"],
                "pixel_mask": s["pixel_mask"],
            })
        else:
            # Merge group into one fissure
            xs = [s["bbox"][0] for s in grupo]
            ys = [s["bbox"][1] for s in grupo]
            x2s = [s["bbox"][0] + s["bbox"][2] for s in grupo]
            y2s = [s["bbox"][1] + s["bbox"][3] for s in grupo]
            
            # Combined pixel mask
            combined_mask = None
            total_length = 0
            for s in grupo:
                if combined_mask is None:
                    combined_mask = s["pixel_mask"].copy()
                else:
                    combined_mask = cv2.bitwise_or(combined_mask, s["pixel_mask"])
                total_length += s["length_px"]
            
            # Recompute angle from combined mask
            pts = np.column_stack(np.where(combined_mask > 0))
            if len(pts) >= 5:
                pts_xy = np.fliplr(pts).astype(np.float32)
                [vx, vy, xx, yy] = cv2.fitLine(pts_xy, cv2.DIST_L2, 0, 0.01, 0.01)
                angle = float(np.degrees(np.arctan2(float(vy[0]), float(vx[0]))) % 180)
            else:
                angle = grupo[0]["angle"]
            
            fissures.append({
                "id": f"F{len(fissures) + 1}",
                "segment_ids": [s["id"] for s in grupo],
                "angle": round(angle, 1),
                "length_px": total_length,
                "length_cm": round(total_length * CM_POR_PX, 1),
                "x": min(xs), "y": min(ys),
                "width": max(x2s) - min(xs),
                "height": max(y2s) - min(ys),
                "centroid": ((min(xs) + max(x2s)) // 2, (min(ys) + max(y2s)) // 2),
                "pixel_mask": combined_mask,
            })
    
    # Post-merge guard: si una fisura cubre >50% del ancho, NO debe tener >20 segmentos
    # (indica chaining excesivo — se deshace el merge)
    fissures_filtered = []
    for f in fissures:
        if f["width"] > img_w * 0.5 and len(f["segment_ids"]) > 10:
            # Convertir de vuelta a segmentos individuales
            for sid in f["segment_ids"]:
                s = [seg for seg in segments if seg["id"] == sid][0]
                fissures_filtered.append({
                    "id": f"F{len(fissures_filtered) + 1}",
                    "segment_ids": [s["id"]],
                    "angle": s["angle"],
                    "length_px": s["length_px"],
                    "length_cm": round(s["length_px"] * CM_POR_PX, 1),
                    "x": s["bbox"][0], "y": s["bbox"][1],
                    "width": s["bbox"][2], "height": s["bbox"][3],
                    "centroid": s["centroid"],
                    "pixel_mask": s["pixel_mask"],
                })
        else:
            fissures_filtered.append(f)
    
    print(f"   Segmentos fusionados: {len(segments)} -> {len(fissures_filtered)} fisuras")
    return fissures_filtered


def _segments_to_fissures(segments: list) -> list:
    """Convert segments directly to fissures (no merging done)."""
    fissures = []
    for s in segments:
        fissures.append({
            "id": f"F{len(fissures) + 1}",
            "segment_ids": [s["id"]],
            "angle": s["angle"],
            "length_px": s["length_px"],
            "length_cm": round(s["length_px"] * CM_POR_PX, 1),
            "x": s["bbox"][0], "y": s["bbox"][1],
            "width": s["bbox"][2], "height": s["bbox"][3],
            "centroid": s["centroid"],
            "pixel_mask": s["pixel_mask"],
        })
    return fissures


def clasificar_familias_angulares(fisuras: list) -> list:
    """
    Clasifica fisuras en familias por rango angular.
    
    F1: 15deg <= angle <= 85deg   -> ROJO
    F2: 95deg <= angle <= 165deg  -> AZUL
    FV: 85deg < angle < 95deg     -> MAGENTA (vertical, opcional)
    IGNORE: resto                 -> VERDE (no cuenta en stats)
    
    Asigna IDs: F1-01, F1-02, F2-01, F2-02, FV-01...
    """
    family_counters = {"F1": 0, "F2": 0, "FV": 0, "IGNORE": 0}
    
    for f in fisuras:
        angle = f["angle"]
        
        if 15 <= angle <= 85:
            family = "F1"
        elif 95 <= angle <= 165:
            family = "F2"
        elif 85 < angle < 95:
            family = "FV"
        else:
            family = "IGNORE"
        
        family_counters[family] += 1
        f["family"] = family
        f["id"] = f"{family}-{family_counters[family]:02d}"
    
    # Stats
    active = {k: v for k, v in family_counters.items() if k != "IGNORE" and v > 0}
    print(f"   Clasificacion por familias:")
    for fam, count in active.items():
        total_cm = sum(f["length_cm"] for f in fisuras if f.get("family") == fam)
        print(f"      {fam}: {count} fisuras, {total_cm:.1f} cm")
    
    ignored = [f for f in fisuras if f.get("family") == "IGNORE"]
    if ignored:
        print(f"      IGNORE: {len(ignored)} lineas (no contadas en total)")
    
    return fisuras


# =====================================================================
#  FUNCIONES DE VISUALIZACION
# =====================================================================


def dibujar_overlay_familias(img: np.ndarray, fisuras: list,
                              desprendimientos: list, skeleton: np.ndarray) -> np.ndarray:
    """
    4-layer overlay:
    Layer 1: Green skeleton (all detected lines, 60% opacity)
    Layer 2: RED skeleton pixels for F1 fissures
    Layer 3: BLUE skeleton pixels for F2 fissures  
    Layer 4: ORANGE transparent fill for detachments
    
    Labels: "F1-01 5.2cm" with dark background box
    Detachment labels: "D1 12.3cm²"
    """
    result = img.copy()
    h, w = result.shape[:2]
    
    # Layer 1: Green skeleton base — ALL lines
    skel_rgb = cv2.cvtColor(skeleton, cv2.COLOR_GRAY2BGR)
    green_skel = np.zeros_like(skel_rgb)
    green_skel[:, :, 1] = skeleton  # Green channel
    cv2.addWeighted(green_skel, 0.6, result, 1.0, 0, result)
    
    # Layer 2 + 3: Draw F1 and F2 skeleton pixels directly in color
    for f in fisuras:
        family = f.get("family", "IGNORE")
        if family == "IGNORE":
            continue  # only drawn in green skeleton already
        
        pixel_mask = f.get("pixel_mask")
        if pixel_mask is None or pixel_mask.size == 0:
            continue
        
        color = (0, 0, 255) if family == "F1" else (255, 0, 0) if family == "F2" else (0, 255, 255)
        
        # Draw colored skeleton pixels on top
        colored = np.zeros_like(result)
        for c in range(3):
            colored[:, :, c] = np.where(pixel_mask > 0, color[c], 0)
        cv2.addWeighted(colored, 0.8, result, 1.0, 0, result)
        
        # Label: family ID + length
        label = f"{f['id']} {f['length_cm']}cm"
        x, y = f.get("x", 0), f.get("y", 0)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
        label_y = max(y - 8, th + 5)
        label_x = min(x, w - tw - 10)
        cv2.rectangle(result, (label_x, label_y - th - 6),
                      (label_x + tw + 8, label_y + 4), (0, 0, 0), -1)
        cv2.putText(result, label, (label_x + 4, label_y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    
    # Layer 4: Detachments in ORANGE transparent
    for d in desprendimientos:
        x, y, cw, ch = d["x"], d["y"], d["width"], d["height"]
        overlay = result.copy()
        cv2.rectangle(overlay, (x, y), (x + cw, y + ch), (0, 165, 255), -1)
        cv2.addWeighted(overlay, 0.4, result, 0.6, 0, result)
        cv2.rectangle(result, (x, y), (x + cw, y + ch), (0, 165, 255), 2)
        
        label = f"{d['id']} {d['area_cm2']}cm2"
        cv2.putText(result, label, (x + 4, y + 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 165, 255), 2)
    
    # Summary panel (top-left)
    overlay = result.copy()
    cv2.rectangle(overlay, (10, 10), (380, 140), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.7, result, 0.3, 0, result)
    
    total_cm = sum(f["length_cm"] for f in fisuras if f.get("family") != "IGNORE")
    f1_count = sum(1 for f in fisuras if f.get("family") == "F1")
    f1_cm = sum(f["length_cm"] for f in fisuras if f.get("family") == "F1")
    f2_count = sum(1 for f in fisuras if f.get("family") == "F2")
    f2_cm = sum(f["length_cm"] for f in fisuras if f.get("family") == "F2")
    
    y0 = 35
    cv2.putText(result, f"Fisuras: {f1_count + f2_count}  Total: {total_cm:.1f}cm",
                (20, y0), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
    cv2.putText(result, f"  F1 (rojo): {f1_count}  {f1_cm:.1f}cm",
                (20, y0 + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
    cv2.putText(result, f"  F2 (azul): {f2_count}  {f2_cm:.1f}cm",
                (20, y0 + 44), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)
    if desprendimientos:
        total_detach = sum(d["area_cm2"] for d in desprendimientos)
        cv2.putText(result, f"Desprendimientos: {len(desprendimientos)}  {total_detach:.1f}cm2",
                    (20, y0 + 66), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 2)
    cv2.putText(result, f"Escala: {CM_POR_PX:.4f}cm/px",
                (20, y0 + 88), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1)
    
    return result


def dibujar_tabla_resultados(img: np.ndarray, fisuras: list,
                              desprendimientos: list) -> np.ndarray:
    """
    Tabla de resultados con:
    - ID | Family | Angle(deg) | Len(px) | Len(cm)
    - Family subtotals
    - Detachment stats
    - No "°" symbol — use "deg"
    """
    result = img.copy()
    h, w = result.shape[:2]
    
    # Table panel on right side
    tabla_w = 340
    tabla_x = w - tabla_w
    
    # Background
    overlay = result.copy()
    cv2.rectangle(overlay, (tabla_x, 0), (w, h), (12, 12, 25), -1)
    cv2.addWeighted(overlay, 0.85, result, 0.15, 0, result)
    
    # Title
    cv2.putText(result, "Resultados", (tabla_x + 15, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
    
    # Headers
    headers = ["ID", "Fam", "Ang(deg)", "px", "cm"]
    x_pos = [tabla_x + 10, tabla_x + 65, tabla_x + 120, tabla_x + 195, tabla_x + 245]
    for hdr, xp in zip(headers, x_pos):
        cv2.putText(result, hdr, (xp, 58),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1)
    
    cv2.line(result, (tabla_x + 8, 64), (w - 8, 64), (70, 70, 70), 1)
    
    # Filter out IGNORE for table
    active = [f for f in fisuras if f.get("family") != "IGNORE"]
    row_colors = [(220, 220, 220), (180, 180, 180)]
    
    for i, f in enumerate(active):
        y_pos = 88 + i * 22
        if y_pos > h - 80:
            break
        
        rc = row_colors[i % 2]
        fam_color = (0, 0, 255) if f["family"] == "F1" else (255, 0, 0) if f["family"] == "F2" else (0, 255, 255)
        
        cv2.putText(result, f['id'], (x_pos[0], y_pos),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, fam_color, 1)
        cv2.putText(result, f['family'], (x_pos[1], y_pos),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, fam_color, 1)
        cv2.putText(result, f"{f['angle']:.0f}deg", (x_pos[2], y_pos),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, rc, 1)
        cv2.putText(result, str(f['length_px']), (x_pos[3], y_pos),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, rc, 1)
        cv2.putText(result, f"{f['length_cm']:.1f}", (x_pos[4], y_pos),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, rc, 1)
    
    # Totals
    y_tot = min(88 + len(active) * 22 + 5, h - 100)
    cv2.line(result, (tabla_x + 8, y_tot), (w - 8, y_tot), (70, 70, 70), 1)
    
    total_cm = sum(f["length_cm"] for f in active)
    y_tot += 18
    cv2.putText(result, f"Total: {len(active)} fisuras  {total_cm:.1f}cm",
                (tabla_x + 10, y_tot), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    
    # Family sub-totals
    y_tot += 22
    for fam in ["F1", "F2"]:
        count = sum(1 for f in active if f["family"] == fam)
        cm = sum(f["length_cm"] for f in active if f["family"] == fam)
        fcolor = (0, 0, 255) if fam == "F1" else (255, 0, 0)
        cv2.putText(result, f"  {fam}: {count} fis  {cm:.1f}cm",
                    (tabla_x + 10, y_tot), cv2.FONT_HERSHEY_SIMPLEX, 0.45, fcolor, 1)
        y_tot += 20
    
    # Detachments
    if desprendimientos:
        y_tot += 5
        cv2.putText(result, f"Desprendimientos:", (tabla_x + 10, y_tot),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 2)
        y_tot += 20
        for d in desprendimientos:
            cv2.putText(result, f"  {d['id']}: {d['area_cm2']}cm2",
                        (tabla_x + 10, y_tot), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 165, 255), 1)
            y_tot += 18
    
    return result


def guardar_resultados(output_dir: Path, img_original: np.ndarray,
                       img_corregida: np.ndarray, mask_clean: np.ndarray,
                       skeleton: np.ndarray, img_overlay: np.ndarray,
                       img_tabla: np.ndarray, fisuras: list,
                       desprendimientos: list):
    """Guarda 4 imagenes + CSV + JSON con resultados."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Images
    cv2.imwrite(str(output_dir / "01_imagen_calibrada.jpg"), img_corregida)
    cv2.imwrite(str(output_dir / "02_mask_binaria_limpia.jpg"), mask_clean)
    cv2.imwrite(str(output_dir / "03_skeleton.jpg"), skeleton)
    cv2.imwrite(str(output_dir / "04_familias_overlay_2d.jpg"), img_tabla)
    print(f"\n💾 Imágenes guardadas en: {output_dir}")
    
    # CSV
    active_fisuras = [f for f in fisuras if f.get("family") != "IGNORE"]
    csv_path = output_dir / "resultados_familias.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "id", "family", "angle_deg", "length_px", "length_cm",
            "x", "y", "width", "height"
        ])
        writer.writeheader()
        for fis in active_fisuras:
            writer.writerow({
                "id": fis["id"],
                "family": fis["family"],
                "angle_deg": f"{fis['angle']:.1f}",
                "length_px": fis["length_px"],
                "length_cm": round(fis["length_cm"], 1),
                "x": fis.get("x", 0),
                "y": fis.get("y", 0),
                "width": fis.get("width", 0),
                "height": fis.get("height", 0),
            })
    print(f"📊 CSV guardado: {csv_path.name}")
    
    # JSON
    total_cm = sum(f["length_cm"] for f in active_fisuras)
    familias_stats = {}
    for fam in ["F1", "F2", "FV"]:
        members = [f for f in active_fisuras if f["family"] == fam]
        if members:
            familias_stats[fam] = {
                "count": len(members),
                "total_cm": round(sum(f["length_cm"] for f in members), 1),
            }
    
    # Clean fisuras for JSON (no pixel_mask)
    fisuras_json = []
    for f in active_fisuras:
        entry = {k: v for k, v in f.items() if k != "pixel_mask"}
        entry["angle_deg"] = entry.pop("angle", 0)
        fisuras_json.append(entry)
    
    resumen = {
        "imagen": "Imagen1.jpeg",
        "dimensiones_cm": {"ancho": MAQUETA_ANCHO_CM, "alto": MAQUETA_ALTO_CM},
        "escala_cm_por_px": CM_POR_PX,
        "total_fisuras": len(active_fisuras),
        "longitud_total_cm": round(total_cm, 1),
        "familias": familias_stats,
        "desprendimientos": desprendimientos,
        "fisuras": fisuras_json,
        "parametros": {
            "adaptive_block": ADAPTIVE_BLOCK_SIZE,
            "adaptive_c": ADAPTIVE_C,
            "min_length_px": MIN_LENGTH_PX,
            "dilate_iterations": DILATE_ITERATIONS,
            "merge_angle_tolerance": MERGE_ANGLE_TOLERANCE,
            "merge_distance_px": MERGE_DISTANCE_TOLERANCE_PX,
        }
    }
    json_path = output_dir / "resumen.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(resumen, f, indent=2, ensure_ascii=False)
    print(f"📋 JSON guardado: {json_path.name}")
    
    # Console summary
    print("\n" + "=" * 60)
    print("RESUMEN FINAL")
    print("=" * 60)
    print(f"   Total fisuras: {len(active_fisuras)}  Total: {total_cm:.1f}cm")
    for fam, data in familias_stats.items():
        print(f"   {fam}: {data['count']} fisuras, {data['total_cm']:.1f}cm")
    if desprendimientos:
        total_detach = sum(d["area_cm2"] for d in desprendimientos)
        print(f"   Desprendimientos: {len(desprendimientos)}  Area: {total_detach:.1f}cm2")
    print(f"\n📁 Output: {output_dir.resolve()}")


# =====================================================================
#  MAIN
# =====================================================================

def main():
    parser = argparse.ArgumentParser(description="Pipeline 2D de deteccion de fisuras y desprendimientos")
    parser.add_argument("--imagen", type=str, default=None)
    parser.add_argument("--camara", type=int, default=None)
    parser.add_argument("--puntos", type=float, nargs=8, default=None)
    parser.add_argument("--output", type=str, default=None)
    args = parser.parse_args()
    
    print("\n" + "=" * 60)
    print("PIPELINE 2D — Deteccion de Fisuras y Desprendimientos")
    print("=" * 60)
    
    # 1. Load image
    if args.camara is not None:
        img = capturar_camara(args.camara)
    elif args.imagen:
        img = cargar_imagen(args.imagen)
    else:
        img_path = DEF_IMG
        if not img_path.exists():
            print(f"Imagen default no encontrada: {img_path}")
            print("Usa --imagen ruta.jpg o --camara 0")
            return
        img = cargar_imagen(str(img_path))
    
    # 2. Correct perspective → 1000x800
    pts = None
    if args.puntos:
        pts = [(args.puntos[i], args.puntos[i + 1]) for i in range(0, 8, 2)]
    img_corregida = corregir_perspectiva(img, pts)
    gray = cv2.cvtColor(img_corregida, cv2.COLOR_BGR2GRAY)
    
    # 3. Binary mask
    print("\nGenerando mascara binaria...")
    mask = generar_mascara_binaria(gray)
    
    # 4. Clean mask
    print("Limpiando mascara...")
    mask = limpiar_mascara(mask)
    mask = eliminar_bordes(mask)
    mask = eliminar_linea_horizontal(mask)
    
    # 5. Detect detachment BEFORE skeleton
    print("Detectando desprendimientos...")
    mask_sin_desprendimientos, desprendimientos = detectar_desprendimientos(mask, IMG_H, IMG_W)
    
    # 6. Skeleton
    print("Obteniendo esqueleto...")
    skeleton = obtener_skeleton(mask_sin_desprendimientos)
    
    # 7. Extract segments from skeleton
    print("Extrayendo segmentos del esqueleto...")
    segments = extraer_segmentos(skeleton)
    if not segments:
        print("   No se encontraron segmentos.")
        return
    
    # 8. Merge nearby segments into fissures
    print("Fusionando segmentos cercanos...")
    fisuras = fusionar_segmentos(segments, IMG_W, IMG_H)
    
    # 9. Classify by angular families
    if fisuras:
        print("Clasificando por familias angulares...")
        fisuras = clasificar_familias_angulares(fisuras)
    
    # 10. Apply minimum length filter
    if MIN_LENGTH_CM > 0:
        fisuras = [f for f in fisuras if f["length_cm"] >= MIN_LENGTH_CM or f.get("family") == "IGNORE"]
    
    # 11. Draw overlays
    print("Dibujando overlays...")
    img_overlay = dibujar_overlay_familias(img_corregida, fisuras, desprendimientos, skeleton)
    img_tabla = dibujar_tabla_resultados(img_overlay, fisuras, desprendimientos)
    
    # 12. Save
    output_dir = Path(args.output) if args.output else OUTPUT_DIR
    guardar_resultados(output_dir, img, img_corregida, mask_sin_desprendimientos,
                       skeleton, img_overlay, img_tabla, fisuras, desprendimientos)


if __name__ == "__main__":
    main()
