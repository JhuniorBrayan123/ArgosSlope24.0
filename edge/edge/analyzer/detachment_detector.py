import cv2
import numpy as np

class DetachmentDetector:
    @staticmethod
    def detect(current_image: np.ndarray, base_image: np.ndarray, threshold: int = 50) -> np.ndarray:
        """
        Detecta cambios masivos entre dos imágenes alineadas (como caídas de rocas de la maqueta).
        Retorna una máscara binaria con las zonas de desprendimiento.
        """
        if current_image is None or base_image is None:
            return np.zeros_like(current_image)[:,:,0] if len(current_image.shape) == 3 else np.zeros_like(current_image)
            
        if current_image.shape != base_image.shape:
            # Reescalar base a current
            base_image = cv2.resize(base_image, (current_image.shape[1], current_image.shape[0]))
            
        gray_curr = cv2.cvtColor(current_image, cv2.COLOR_BGR2GRAY) if len(current_image.shape) == 3 else current_image.copy()
        gray_base = cv2.cvtColor(base_image, cv2.COLOR_BGR2GRAY) if len(base_image.shape) == 3 else base_image.copy()
        
        # Desenfoque para evitar falsos positivos por ruido
        blur_curr = cv2.GaussianBlur(gray_curr, (21, 21), 0)
        blur_base = cv2.GaussianBlur(gray_base, (21, 21), 0)
        
        diff = cv2.absdiff(blur_base, blur_curr)
        _, thresh = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)
        
        # Limpiar ruido
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
        cleaned = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel)
        
        return cleaned
