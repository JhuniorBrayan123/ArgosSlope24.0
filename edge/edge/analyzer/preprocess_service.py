import cv2
import numpy as np

class PreprocessService:
    @staticmethod
    def process(image: np.ndarray) -> np.ndarray:
        """
        Convierte a escala de grises, aplica CLAHE para mejorar el contraste
        y un filtro gaussiano para reducir ruido.
        """
        # Convertir a grises
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Aplicar CLAHE (Contrast Limited Adaptive Histogram Equalization)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray_clahe = clahe.apply(gray)
        
        # Reducción de ruido
        blurred = cv2.GaussianBlur(gray_clahe, (5, 5), 0)
        
        return blurred
