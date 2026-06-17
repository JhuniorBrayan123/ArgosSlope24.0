import cv2
import numpy as np
from typing import List

class CrackValidator:
    @staticmethod
    def filter_contours(binary_image: np.ndarray, min_area: float = 50.0, max_area: float = 10000.0) -> np.ndarray:
        """
        Filtra los contornos que no tienen forma de fisura (e.g., ruido, objetos cuadrados).
        Retorna una nueva máscara binaria solo con las fisuras válidas.
        """
        contours, _ = cv2.findContours(binary_image, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        valid_mask = np.zeros_like(binary_image)
        
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area or area > max_area:
                continue
                
            # Filtro por aspect ratio (bounding box)
            x, y, w, h = cv2.boundingRect(cnt)
            aspect_ratio = float(w) / h if h != 0 else 0
            if 0.5 < aspect_ratio < 2.0 and area > 500:
                # Es muy cuadrado y grande, probablemente no es fisura
                continue
                
            # Filtro por "delgadez" usando minAreaRect
            rect = cv2.minAreaRect(cnt)
            (cx, cy), (rw, rh), angle = rect
            
            if rw == 0 or rh == 0:
                continue
                
            rect_area = rw * rh
            extent = area / rect_area if rect_area > 0 else 0
            
            # Las fisuras suelen llenar pobremente su bounding rect orientado (menor a 0.5)
            # Y la relación entre el lado mayor y menor del rectangulo debe ser alta
            max_side = max(rw, rh)
            min_side = min(rw, rh)
            
            if (max_side / min_side) > 2.0:
                cv2.drawContours(valid_mask, [cnt], -1, 255, -1)
                
        return valid_mask
