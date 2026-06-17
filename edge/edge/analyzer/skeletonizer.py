import cv2
import numpy as np

class Skeletonizer:
    @staticmethod
    def process(binary_image: np.ndarray) -> np.ndarray:
        """
        Aplica thinning de Zhang-Suen para obtener el esqueleto de 1px de grosor.
        Requiere opencv-contrib-python.
        """
        try:
            # cv2.ximgproc está en opencv-contrib-python
            skeleton = cv2.ximgproc.thinning(binary_image, thinningType=cv2.ximgproc.THINNING_ZHANGSUEN)
            return skeleton
        except AttributeError:
            print("WARNING: cv2.ximgproc no está disponible. ¿Instalaste opencv-contrib-python?")
            print("Fallback: usando skeletonización manual (muy lenta).")
            return Skeletonizer._manual_skeletonize(binary_image)
            
    @staticmethod
    def _manual_skeletonize(img: np.ndarray) -> np.ndarray:
        """Fallback si no está instalado ximgproc"""
        size = np.size(img)
        skel = np.zeros(img.shape, np.uint8)
        ret, img = cv2.threshold(img, 127, 255, 0)
        element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3,3))
        done = False
        while not done:
            eroded = cv2.erode(img, element)
            temp = cv2.dilate(eroded, element)
            temp = cv2.subtract(img, temp)
            skel = cv2.bitwise_or(skel, temp)
            img = eroded.copy()
            zeros = size - cv2.countNonZero(img)
            if zeros == size:
                done = True
        return skel
