import cv2
import numpy as np
from typing import List, Dict, Any

class OverlayRenderer:
    FAMILY_COLORS = {
        "F1": (0, 0, 255),    # Rojo
        "F2": (0, 255, 0),    # Verde
        "F3": (255, 0, 0),    # Azul
        "Unknown": (0, 255, 255) # Amarillo
    }

    @staticmethod
    def render(image: np.ndarray, cracks: List[Dict[str, Any]], detachment_mask: np.ndarray = None) -> np.ndarray:
        """
        Dibuja los resultados de análisis sobre una copia de la imagen.
        """
        output = image.copy()
        
        # 1. Dibujar desprendimientos (rojo translúcido)
        if detachment_mask is not None:
            red_overlay = np.zeros_like(output)
            red_overlay[:, :, 2] = 255  # BGR
            mask_bool = detachment_mask > 0
            
            output[mask_bool] = cv2.addWeighted(output[mask_bool], 0.5, red_overlay[mask_bool], 0.5, 0)
            
        # 2. Dibujar fisuras y sus IDs
        for crack in cracks:
            family = crack.get("family", "Unknown")
            color = OverlayRenderer.FAMILY_COLORS.get(family, (255, 255, 255))
            
            # Dibujar la línea exacta de la fisura (si está disponible)
            contour = crack.get("contour", [])
            if contour:
                pts = np.array(contour, np.int32)
                pts = pts.reshape((-1, 1, 2))
                cv2.polylines(output, [pts], isClosed=False, color=color, thickness=2)
            else:
                # Fallback: Dibujar bounding box solo si no hay contorno
                bbox = crack.get("bbox", {})
                if bbox:
                    x, y, w, h = bbox.get("x", 0), bbox.get("y", 0), bbox.get("w", 0), bbox.get("h", 0)
                    cv2.rectangle(output, (x, y), (x+w, y+h), color, 1)
                
            # Texto con ID centrado
            cx, cy = crack.get("center", {}).get("x", 0), crack.get("center", {}).get("y", 0)
            if cx > 0 and cy > 0:
                cv2.putText(output, crack["id"], (int(cx) + 5, int(cy) - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
            
        return output
