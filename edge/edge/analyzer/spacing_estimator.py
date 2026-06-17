from typing import List, Dict, Any
import numpy as np
import cv2

class SpacingEstimator:
    @staticmethod
    def estimate(cracks: List[Dict[str, Any]], image_width: int, image_height: int, mm_per_px: float = 1.0) -> Dict[str, Any]:
        """
        Estima el espaciamiento geomecánico de la red de fisuras.
        1. Scanline (Línea de muestreo horizontal al centro de la imagen).
        2. Espaciamiento por familias (distancia perpendicular entre ramas paralelas).
        """
        # --- 1. Método Scanline ---
        # Trazamos una línea horizontal por el medio de la imagen
        scanline_y = image_height // 2
        intersections_x = []
        
        # Buscar intersecciones entre la scanline y cada rama
        for c in cracks:
            contour = c.get("contour", [])
            if not contour:
                continue
                
            for i in range(len(contour) - 1):
                x1, y1 = contour[i][0]
                x2, y2 = contour[i+1][0]
                
                # Check if the line segment crosses the scanline_y
                if min(y1, y2) <= scanline_y <= max(y1, y2):
                    if y1 == y2: # Segmento horizontal coincidente
                        intersections_x.append(x1)
                    else:
                        # Interpolación lineal para hallar X en la scanline
                        x_int = x1 + (x2 - x1) * (scanline_y - y1) / (y2 - y1)
                        intersections_x.append(x_int)
                        
        # Ordenar y limpiar intersecciones duplicadas cercanas
        intersections_x.sort()
        filtered_x = []
        if intersections_x:
            filtered_x.append(intersections_x[0])
            for x in intersections_x[1:]:
                if x - filtered_x[-1] > 3.0: # Umbral de 3px para evitar ruidos
                    filtered_x.append(x)
                    
        # Distancias a lo largo de la Scanline
        scanline_distances_px = []
        for i in range(len(filtered_x) - 1):
            scanline_distances_px.append(filtered_x[i+1] - filtered_x[i])
            
        avg_scanline_px = float(np.mean(scanline_distances_px)) if scanline_distances_px else 0.0
        avg_scanline_mm = avg_scanline_px * mm_per_px

        # --- 2. Método Volumétrico Indirecto (Jv) por Familias ---
        families = {}
        for c in cracks:
            f = c.get("family", "Unknown")
            if f not in families:
                families[f] = []
            families[f].append(c)
            
        spacing_results = {}
        jv = 0.0
        
        for f_name, f_cracks in families.items():
            if len(f_cracks) < 2:
                spacing_results[f_name] = {
                    "spacing_px": 0.0,
                    "spacing_mm": 0.0,
                    "count": len(f_cracks)
                }
                continue
                
            # Distancia promedio entre centros proyectada ortogonalmente
            avg_angle = np.mean([c["orientation"] for c in f_cracks])
            rad = np.radians(avg_angle)
            nx, ny = -np.sin(rad), np.cos(rad)
            
            projections = []
            for c in f_cracks:
                cx = c["center"]["x"]
                cy = c["center"]["y"]
                projections.append(cx * nx + cy * ny)
                
            projections.sort()
            diffs = [projections[i+1] - projections[i] for i in range(len(projections)-1)]
            avg_spacing_px = float(np.mean(diffs)) if diffs else 0.0
            avg_spacing_mm = abs(avg_spacing_px) * mm_per_px
            
            spacing_results[f_name] = {
                "spacing_px": abs(avg_spacing_px),
                "spacing_mm": avg_spacing_mm,
                "count": len(f_cracks)
            }
            
            # Sumar al Jv si el espaciamiento es válido
            if avg_spacing_mm > 0:
                s_m = avg_spacing_mm / 1000.0
                jv += (1.0 / s_m)
                
        # RQD = 115 - 3.3 Jv (Empírico Palmström)
        rqd = 115.0 - (3.3 * jv) if jv > 0 else 100.0
        rqd = max(0.0, min(100.0, rqd))
            
        return {
            "by_family": spacing_results,
            "scanline": {
                "y_position": scanline_y,
                "intersections": len(filtered_x),
                "spacing_px": avg_scanline_px,
                "spacing_mm": avg_scanline_mm
            },
            "estimated_jv": jv,
            "estimated_rqd": rqd
        }
