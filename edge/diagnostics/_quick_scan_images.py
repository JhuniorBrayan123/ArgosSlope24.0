"""
Quick scan all calibration images to understand their content.
"""
import cv2
import numpy as np
import os

BASE = r'E:\PROYECTO-QUICKSTART\ProyectoMineria\ArgosSlope4.0\edge\edge\calibration\calib_images'

for name in ['Imagen1.jpeg', 'Imagen completa.jpeg', 'Fisuras_reales.jpeg']:
    path = os.path.join(BASE, name)
    img = cv2.imread(path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    print(f'\n=== {name} ({w}x{h}) ===')

    # Adaptive threshold (same as pipeline)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(blur)
    mask = cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY_INV, 31, 8)

    # Remove border-touching components
    border_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
    cv2.floodFill(mask.copy(), border_mask, (0, 0), 255)
    border_mask = border_mask[1:-1, 1:-1]
    mask_inner = mask.copy()
    mask_inner[border_mask == 255] = 0

    # Keep only sizable components
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask_inner, connectivity=8)
    mask_clean = np.zeros_like(mask_inner)
    for i in range(1, num_labels):
        if stats[i][4] > 500:
            mask_clean[labels == i] = 255

    # Large morphological close to find dense clusters
    kernel = np.ones((15, 15), dtype=np.uint8)
    closed = cv2.morphologyEx(mask_clean, cv2.MORPH_CLOSE, kernel, iterations=2)
    closed = cv2.dilate(closed, kernel, iterations=1)

    num_labels2, labels2, stats2, _ = cv2.connectedComponentsWithStats(closed, connectivity=8)

    candidates = []
    for i in range(1, num_labels2):
        x, y, cw, ch, area = stats2[i]
        bbox_area = cw * ch
        density = area / bbox_area if bbox_area > 0 else 0
        ar = max(cw, ch) / max(min(cw, ch), 1)

        if area > h * w * 0.5:
            continue  # skip whole-image component

        if area > 1200 and cw > 60 and ch > 40 and density > 0.12 and ar < 5.5:
            region = mask_clean[y:y + ch, x:x + cw]
            actual_fisura_px = cv2.countNonZero(region)

            loc = 'TL' if x < w // 2 and y < h // 2 else \
                  'TR' if x >= w // 2 and y < h // 2 else \
                  'BL' if x < w // 2 else 'BR'

            candidates.append({
                'loc': loc,
                'x': x, 'y': y, 'w': cw, 'h': ch,
                'area': area,
                'density': round(density, 2),
                'ar': round(ar, 1),
                'actual_px': actual_fisura_px,
            })

    if candidates:
        print(f'  Zonas con perfil de desprendimiento ({len(candidates)}):')
        for c in candidates:
            print(f'    {c["loc"]} en ({c["x"]},{c["y"]}) {c["w"]}x{c["h"]} '
                  f'| area={c["area"]} | density={c["density"]} | ar={c["ar"]} '
                  f'| px_fisura={c["actual_px"]}')
    else:
        print('  No se detectaron zonas de desprendimiento con los thresholds actuales')

    # Quadrant breakdown
    q_h, q_w = h // 3, w // 3
    for row in range(3):
        for col in range(3):
            y1, x1 = row * q_h, col * q_w
            y2 = min(y1 + q_h, h)
            x2 = min(x1 + q_w, w)
            region = mask_clean[y1:y2, x1:x2]
            pct = cv2.countNonZero(region) / ((x2 - x1) * (y2 - y1)) * 100
            label = ['Top', 'Mid', 'Bot'][row] + ['L', 'C', 'R'][col]
            bar = '#' * int(pct / 2) + '.' * (20 - int(pct / 2))
            print(f'    [{label}] {pct:5.1f}%  |{bar}|')
