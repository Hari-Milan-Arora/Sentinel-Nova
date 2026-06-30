"""
Confidence Calibration Module for Sentinel Nova
Computes confidence scores, error margins, and statistical prediction intervals.
"""

import numpy as np
from typing import Dict, Any, List

class ConfidenceCalibrator:
    @staticmethod
    def calculate_confidence_score(
        sample_size: int,
        data_quality_score: float,
        model_f1: float,
        variance: float = 0.0
    ) -> float:
        """
        Calculates calibrated confidence using sample sizes, feature qualities, and historic model accuracies.
        """
        # Diminishing returns on sample size (log curve)
        sample_factor = min(1.0, np.log(sample_size + 1) / np.log(100)) if sample_size > 0 else 0.1
        
        # Base confidence calculation
        raw_confidence = (0.3 * sample_factor) + (0.35 * data_quality_score) + (0.35 * model_f1)
        
        # Deduct confidence for high variance
        variance_penalty = min(0.2, variance * 0.1)
        calibrated = max(0.2, raw_confidence - variance_penalty)
        
        return round(float(calibrated) * 100, 1)

    @staticmethod
    def calculate_prediction_intervals(forecast_values: List[float], historical_error: float) -> List[Dict[str, float]]:
        """
        Generates standard error bounds (lower & upper prediction limits) for a sequence of forecasts.
        """
        intervals = []
        for i, val in enumerate(forecast_values):
            # Error compounds slightly further into the future (sqrt of step index)
            compound_factor = np.sqrt(i + 1)
            margin = historical_error * compound_factor * 1.96 # 95% confidence level
            intervals.append({
                "value": float(val),
                "lower_bound": float(np.clip(val - margin, 0.0, 100.0)),
                "upper_bound": float(np.clip(val + margin, 0.0, 100.0))
            })
        return intervals
