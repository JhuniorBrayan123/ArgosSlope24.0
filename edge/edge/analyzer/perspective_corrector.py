import cv2
import numpy as np
from typing import List, Dict

class PerspectiveCorrector:
    @staticmethod
    def correct(image: np.ndarray, points: List[Dict[str, float]]) -> np.ndarray:
        """
        Rectifica la imagen basada en 4 puntos que definen un cuadrilátero (orden: TL, TR, BR, BL).
        """
        if not points or len(points) != 4:
            return image
            
        pts_src = np.array([[p["x"], p["y"]] for p in points], dtype="float32")
        
        # Determinar dimensiones de la nueva imagen
        width_a = np.sqrt(((pts_src[2][0] - pts_src[3][0]) ** 2) + ((pts_src[2][1] - pts_src[3][1]) ** 2))
        width_b = np.sqrt(((pts_src[1][0] - pts_src[0][0]) ** 2) + ((pts_src[1][1] - pts_src[0][1]) ** 2))
        max_width = max(int(width_a), int(width_b))
        
        height_a = np.sqrt(((pts_src[1][0] - pts_src[2][0]) ** 2) + ((pts_src[1][1] - pts_src[2][1]) ** 2))
        height_b = np.sqrt(((pts_src[0][0] - pts_src[3][0]) ** 2) + ((pts_src[0][1] - pts_src[3][1]) ** 2))
        max_height = max(int(height_a), int(height_b))
        
        pts_dst = np.array([
            [0, 0],
            [max_width - 1, 0],
            [max_width - 1, max_height - 1],
            [0, max_height - 1]
        ], dtype="float32")
        
        matrix = cv2.getPerspectiveTransform(pts_src, pts_dst)
        warped = cv2.warpPerspective(image, matrix, (max_width, max_height))
        
        return warped
