from typing import List, Dict, Any

class CrackFamilyClassifier:
    @staticmethod
    def classify(cracks: List[Dict[str, Any]], num_families: int = 3) -> List[Dict[str, Any]]:
        """
        Clasifica fisuras en familias basándose puramente en la orientación.
        Usa partición de 180 grados.
        """
        if not cracks:
            return cracks
            
        # Algoritmo simple basado en umbrales estáticos 
        # (ej. F1: 0-60, F2: 60-120, F3: 120-180)
        bin_size = 180.0 / num_families
        
        for crack in cracks:
            angle = crack.get("orientation", 0.0)
            
            family_index = int(angle // bin_size)
            if family_index >= num_families:
                family_index = num_families - 1
                
            crack["family"] = f"F{family_index + 1}"
            
        return cracks
