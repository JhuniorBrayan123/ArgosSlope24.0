import cv2
import numpy as np
from typing import Tuple, Dict, Any, Optional

class RoiService:
    @staticmethod
    def crop_to_roi(image: np.ndarray, roi: Optional[Dict[str, Any]] = None) -> Tuple[np.ndarray, Tuple[int, int]]:
        """
        Recorta la imagen usando el ROI especificado (x, y, width, height).
        Retorna la imagen recortada y el offset (x, y) usado, para luego recalcular coordenadas globales.
        """
        if roi is None:
            return image, (0, 0)
            
        x = int(roi.get("x", 0))
        y = int(roi.get("y", 0))
        w = int(roi.get("width", image.shape[1]))
        h = int(roi.get("height", image.shape[0]))
        
        # Validar límites
        x = max(0, min(x, image.shape[1] - 1))
        y = max(0, min(y, image.shape[0] - 1))
        w = max(1, min(w, image.shape[1] - x))
        h = max(1, min(h, image.shape[0] - y))
        
        cropped = image[y:y+h, x:x+w].copy()
        return cropped, (x, y)
