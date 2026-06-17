import cv2
import numpy as np
from typing import List, Dict, Any
import math

class CrackMeasurement:
    @staticmethod
    def measure(valid_mask: np.ndarray, skeleton: np.ndarray, mm_per_px: float = 1.0) -> List[Dict[str, Any]]:
        """
        Mide las propiedades de las fisuras basándose en la topología del esqueleto.
        Extrae ramas individuales (segmentos entre intersecciones) usando análisis de vecindad.
        """
        measurements = []
        
        # Asegurar que el esqueleto sea binario (0 y 1)
        skel_bin = (skeleton > 0).astype(np.uint8)
        
        # Kernel 3x3 para contar la vecindad de 8 píxeles
        kernel = np.array([[1, 1, 1],
                           [1, 1, 1],
                           [1, 1, 1]], dtype=np.uint8)
                           
        # Contar vecinos por cada pixel (incluyendo el pixel central)
        neighbors = cv2.filter2D(skel_bin, -1, kernel)
        
        # Nodos (intersecciones) son píxeles del esqueleto con > 3 de valor (centro + >2 vecinos)
        nodes_mask = ((neighbors > 3) & (skel_bin == 1)).astype(np.uint8) * 255
        
        # Opcional: dilatar nodos un poco para asegurar que las ramas se desconecten bien
        node_dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        nodes_mask = cv2.dilate(nodes_mask, node_dilate_kernel, iterations=1)
        
        # Ramas aisladas: Esqueleto menos Nodos
        branches_mask = cv2.subtract(skeleton, nodes_mask)
        
        # Buscar los contornos de estas ramas individuales (CHAIN_APPROX_NONE para tener todos los puntos)
        contours, _ = cv2.findContours(branches_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        
        # Calcular mapa de distancias sobre la máscara original para calcular la apertura de la fisura
        dist_transform = cv2.distanceTransform(valid_mask, cv2.DIST_L2, 3)
        
        crack_id = 1
        for cnt in contours:
            # Longitud real: cantidad de píxeles en la rama (o perímetro aproximado)
            length_px = cv2.arcLength(cnt, closed=False) / 2.0
            if length_px < 1.0:
                length_px = float(len(cnt)) # Fallback a conteo de puntos
            
            # Ignorar segmentos extremadamente pequeños (ruido geomecánico)
            if length_px < 5.0:
                continue
                
            # Orientación aproximada usando la línea recta entre inicio y fin, o PCA / fitLine
            if len(cnt) > 2:
                [vx, vy, x, y] = cv2.fitLine(cnt, cv2.DIST_L2, 0, 0.01, 0.01)
                angle_rad = math.atan2(float(vy[0]), float(vx[0]))
                angle = math.degrees(angle_rad) % 180
                cx, cy = float(x[0]), float(y[0])
            else:
                angle = 0.0
                cx = float(cnt[0][0][0])
                cy = float(cnt[0][0][1])
                
            # Calcular apertura promedio muestreando el mapa de distancias en los puntos de la rama
            apertures = []
            for pt in cnt:
                px, py = pt[0]
                # distanceTransform da la distancia al borde más cercano (radio). Apertura = 2 * radio
                r = dist_transform[py, px]
                apertures.append(r * 2)
                
            aperture_px = float(np.mean(apertures)) if apertures else 1.0
            
            # Caja para el bounding box opcional
            bx, by, bw, bh = cv2.boundingRect(cnt)
            
            measurements.append({
                "id": f"C_{crack_id}",
                "length_px": float(length_px),
                "length_mm": float(length_px * mm_per_px),
                "aperture_px": float(aperture_px),
                "aperture_mm": float(aperture_px * mm_per_px),
                "area_px": float(length_px * aperture_px),
                "orientation": float(angle),
                "bbox": {"x": bx, "y": by, "w": bw, "h": bh},
                "center": {"x": cx, "y": cy},
                "contour": cnt.tolist() # Útil si queremos renderizar la línea exacta
            })
            crack_id += 1
            
        return measurements
