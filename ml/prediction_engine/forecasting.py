"""
Forecasting and Trend Analysis Module for Sentinel Nova
Implements Double Exponential Smoothing and Linear Regression projections for telemetry signals.
"""

import numpy as np
from typing import List

class TimeSeriesForecaster:
    @staticmethod
    def double_exponential_smoothing(series: List[float], alpha: float, beta: float, n_preds: int) -> List[float]:
        """
        Applies Holt's Linear Exponential Smoothing to forecast future series steps.
        """
        if len(series) < 2:
            return [series[0]] * n_preds if series else [0.0] * n_preds
            
        result = [series[0]]
        level = series[0]
        trend = series[1] - series[0]
        
        for i in range(1, len(series)):
            val = series[i]
            last_level, level = level, alpha * val + (1 - alpha) * (level + trend)
            trend = beta * (level - last_level) + (1 - beta) * trend
            result.append(level + trend)
            
        # Forecast future points
        forecasts = []
        for i in range(1, n_preds + 1):
            forecasts.append(float(np.clip(level + i * trend, 0.0, 100.0)))
            
        return forecasts

    @staticmethod
    def linear_trend(series: List[float], n_preds: int) -> List[float]:
        """
        Projects trends using standard Ordinary Least Squares linear regression.
        """
        if not series:
            return [0.0] * n_preds
        if len(series) == 1:
            return [series[0]] * n_preds
            
        x = np.arange(len(series))
        y = np.array(series)
        
        slope, intercept = np.polyfit(x, y, 1)
        
        forecasts = []
        for i in range(len(series), len(series) + n_preds):
            val = slope * i + intercept
            forecasts.append(float(np.clip(val, 0.0, 100.0)))
            
        return forecasts
