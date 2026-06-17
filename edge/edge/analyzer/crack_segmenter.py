import cv2
import numpy as np

class CrackSegmenter:
    @staticmethod
    def segment(gray_image: np.ndarray) -> np.ndarray:
        """
        Segmenta fisuras en una imagen preprocesada en escala de grises.
        Utiliza Black-Hat morphológico para destacar elementos oscuros (fisuras) sobre fondos claros,
        seguido de umbralización.
        """
        # Aplicar desenfoque bilateral para mantener bordes pero limpiar textura de la maqueta
        blurred = cv2.bilateralFilter(gray_image, 9, 75, 75)
        
        # Aplicar CLAHE para ecualizar contrastes (resalta las líneas negras sobre fondo blanco)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(blurred)

        # Usar umbralización adaptativa en imagen invertida o directamente Black-Hat
        # Extraer trazos oscuros: Adaptive Thresholding
        thresh = cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 10)
        
        # Limpieza morfológica para eliminar pequeñas manchas o ruidos
        kernel_clean = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        cleaned = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel_clean)
        
        # Dilatar levemente para asegurar conectividad de líneas antes del esqueleto
        cleaned = cv2.dilate(cleaned, kernel_clean, iterations=1)
        
        return cleaned
