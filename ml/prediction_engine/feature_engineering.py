"""
Feature Engineering Module for AEaaS Sentinel Nova
Defines features, aggregates time-series logs, and compiles feature vectors for predictive inference.
"""

import numpy as np
from typing import Dict, List, Any

class FeatureEngineer:
    def __init__(self):
        pass

    def compute_task_velocity(self, completed_tasks: List[Dict[str, Any]], window_days: int = 7) -> float:
        """
        Calculates the number of tasks completed per day over the specified window.
        """
        if not completed_tasks:
            return 0.0
        
        # Calculate tasks completed in the window
        # In production, this would parse ISO timestamps
        completed_count = len(completed_tasks)
        return float(completed_count) / max(1, window_days)

    def compute_goal_momentum(self, goals: List[Dict[str, Any]]) -> float:
        """
        Computes progress velocity of all active goals.
        """
        if not goals:
            return 0.0
        total_progress = sum(g.get('progress', 0) for g in goals)
        return float(total_progress) / len(goals)

    def compute_skill_growth_rate(self, skill_history: List[Dict[str, Any]]) -> float:
        """
        Measures the slope of skill accumulation over time.
        """
        if len(skill_history) < 2:
            return 0.0
        
        scores = [sh.get('score', 0) for sh in skill_history]
        times = list(range(len(scores)))
        slope, _ = np.polyfit(times, scores, 1)
        return float(slope)

    def compute_burnout_risk_score(self, working_hours_per_day: List[float], completed_ratios: List[float]) -> float:
        """
        Generates a complex burnout risk score based on work hours volatility, high workloads, and dropping completion ratios.
        """
        if not working_hours_per_day:
            return 0.0
            
        mean_hours = np.mean(working_hours_per_day)
        std_hours = np.std(working_hours_per_day) if len(working_hours_per_day) > 1 else 0.0
        
        # High hours + high volatility increases risk
        hour_factor = min(10.0, mean_hours + 0.5 * std_hours) / 10.0
        
        # Low completion ratio under high pressure increases risk
        completion_factor = 1.0 - (np.mean(completed_ratios) if completed_ratios else 0.8)
        
        burnout_index = (0.7 * hour_factor) + (0.3 * completion_factor)
        return float(np.clip(burnout_index, 0.0, 1.0))

    def build_inference_vector(self, user_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compiles calculated features into a unified vector for model consumption.
        """
        completed_tasks = user_context.get('completed_tasks', [])
        goals = user_context.get('goals', [])
        skill_history = user_context.get('skill_history', [])
        work_hours = user_context.get('work_hours', [8.0, 8.5, 9.0, 7.5, 8.0])
        completion_rates = user_context.get('completion_rates', [0.9, 0.85, 0.9, 0.7, 0.8])
        
        return {
            "task_velocity": self.compute_task_velocity(completed_tasks),
            "goal_momentum": self.compute_goal_momentum(goals),
            "skill_growth_rate": self.compute_skill_growth_rate(skill_history),
            "burnout_risk": self.compute_burnout_risk_score(work_hours, completion_rates),
            "time_management_score": float(np.mean(completion_rates) * 100) if completion_rates else 80.0
        }
