import cv2
import numpy as np
import json
import base64
from typing import Dict, Any, Optional

from edge.analyzer.roi_service import RoiService
from edge.analyzer.perspective_corrector import PerspectiveCorrector
from edge.analyzer.preprocess_service import PreprocessService
from edge.analyzer.crack_segmenter import CrackSegmenter
from edge.analyzer.crack_validator import CrackValidator
from edge.analyzer.skeletonizer import Skeletonizer
from edge.analyzer.crack_measurement import CrackMeasurement
from edge.analyzer.crack_family_classifier import CrackFamilyClassifier
from edge.analyzer.spacing_estimator import SpacingEstimator
from edge.analyzer.detachment_detector import DetachmentDetector
from edge.analyzer.overlay_renderer import OverlayRenderer

class AnalyzerPipeline:
    def __init__(self, mm_per_px: float = 1.0):
        self.mm_per_px = mm_per_px
        
    def execute(self, image: np.ndarray, config: Dict[str, Any], base_image: Optional[np.ndarray] = None) -> Dict[str, Any]:
        """
        Ejecuta el pipeline completo de análisis 2D sobre la imagen.
        """
        roi = config.get("roi")
        perspective_pts = config.get("perspective_pts")
        
        # 1. Aplicar Corrección de Perspectiva (si hay puntos)
        if perspective_pts:
            image = PerspectiveCorrector.correct(image, perspective_pts)
            
        # 2. Recortar ROI
        cropped, offset = RoiService.crop_to_roi(image, roi)
        
        # 3. Preprocesar
        processed = PreprocessService.process(cropped)
        
        # 4. Segmentación
        binary_cracks = CrackSegmenter.segment(processed)
        
        # 5. Validación Morfométrica
        valid_cracks = CrackValidator.filter_contours(binary_cracks)
        
        # 6. Skeletonization
        skeleton = Skeletonizer.process(valid_cracks)
        
        # 7. Medición
        cracks_measurements = CrackMeasurement.measure(valid_cracks, skeleton, self.mm_per_px)
        
        # Ajustar coordenadas globales por el offset del ROI
        for c in cracks_measurements:
            c["bbox"]["x"] += offset[0]
            c["bbox"]["y"] += offset[1]
            c["center"]["x"] += offset[0]
            c["center"]["y"] += offset[1]
            
            if "contour" in c:
                for pt in c["contour"]:
                    pt[0][0] += offset[0]
                    pt[0][1] += offset[1]
            
        # 8. Clasificación de Familias
        classified_cracks = CrackFamilyClassifier.classify(cracks_measurements)
        
        # 9. Estimación de Espaciamiento y RQD
        spacing_results = SpacingEstimator.estimate(classified_cracks, image.shape[1], image.shape[0], self.mm_per_px)
        
        # 10. Detección de Desprendimiento (si aplica)
        detachment_mask = None
        if base_image is not None:
            # Crop y perspective en la base image también si es necesario (asumimos que ya viene alineada o aplicamos roi)
            base_cropped, _ = RoiService.crop_to_roi(base_image, roi)
            detachment_mask = DetachmentDetector.detect(cropped, base_cropped)
            
            # Pad mask to original size
            full_mask = np.zeros(image.shape[:2], dtype=np.uint8)
            h, w = detachment_mask.shape
            full_mask[offset[1]:offset[1]+h, offset[0]:offset[0]+w] = detachment_mask
            detachment_mask = full_mask
            
        # 11. Overlay
        result_image = OverlayRenderer.render(image, classified_cracks, detachment_mask)
        
        # 12. Generar resultado
        _, buffer = cv2.imencode('.jpg', result_image, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return {
            "success": True,
            "cracks": classified_cracks,
            "spacing": spacing_results,
            "processedImagePath": None, # Will be set by backend if saved
            "imageBase64": img_base64,
            "roi_offset": {"x": offset[0], "y": offset[1]}
        }
