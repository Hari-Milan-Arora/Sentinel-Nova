"""
Feature Engineering Module for AEaaS Sentinel Nova
Defines features, aggregates time-series logs, and compiles feature vectors for predictive inference.
"""

import numpy as np
from typing import Dict, List, Any
from datetime import datetime, timedelta, timezone


def _finite_values(values: List[Any]) -> List[float]:
    output = []
    for value in values:
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if np.isfinite(number):
            output.append(number)
    return output

class FeatureEngineer:
    def __init__(self):
        pass

    def compute_task_velocity(self, completed_tasks: List[Dict[str, Any]], window_days: int = 7) -> float | None:
        """
        Calculates the number of tasks completed per day over the specified window.
        """
        if not isinstance(completed_tasks, list) or not completed_tasks:
            return None
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=max(1, window_days))
        timestamps = []
        for task in completed_tasks:
            if not isinstance(task, dict):
                continue
            raw = task.get('completedAt') or task.get('completed_at')
            if not isinstance(raw, str):
                continue
            try:
                timestamp = datetime.fromisoformat(raw.replace('Z', '+00:00'))
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=timezone.utc)
                timestamps.append(timestamp.astimezone(timezone.utc))
            except ValueError:
                continue
        if not timestamps:
            return None
        recent_count = sum(1 for timestamp in timestamps if cutoff <= timestamp <= now)
        return float(recent_count) / max(1, window_days)

    def compute_goal_momentum(self, goals: List[Dict[str, Any]]) -> float:
        """
        Computes progress velocity of all active goals.
        """
        if not goals:
            return 0.0
        progress = _finite_values([g.get('progress', 0) for g in goals if isinstance(g, dict)])
        return float(np.mean(progress)) if progress else 0.0

    def compute_skill_growth_rate(self, skill_history: List[Dict[str, Any]]) -> float:
        """
        Measures the slope of skill accumulation over time.
        """
        if len(skill_history) < 2:
            return 0.0
        
        scores = _finite_values([sh.get('score', 0) for sh in skill_history if isinstance(sh, dict)])
        if len(scores) < 2:
            return 0.0
        times = list(range(len(scores)))
        slope, _ = np.polyfit(times, scores, 1)
        return float(slope)

    def compute_burnout_risk_score(self, working_hours_per_day: List[float], completed_ratios: List[float]) -> float | None:
        """
        Generates a complex burnout risk score based on work hours volatility, high workloads, and dropping completion ratios.
        """
        if not isinstance(working_hours_per_day, list) or not working_hours_per_day:
            return None
        hours = _finite_values(working_hours_per_day)
        if not hours:
            return 0.0
        mean_hours = np.mean(hours)
        std_hours = np.std(hours) if len(hours) > 1 else 0.0
        
        # High hours + high volatility increases risk
        hour_factor = min(10.0, mean_hours + 0.5 * std_hours) / 10.0
        
        # Low completion ratio under high pressure increases risk
        ratios = _finite_values(completed_ratios)
        completion_factor = 1.0 - float(np.mean(np.clip(ratios, 0.0, 1.0))) if ratios else 0.2
        
        burnout_index = (0.7 * hour_factor) + (0.3 * completion_factor)
        return float(np.clip(burnout_index, 0.0, 1.0))

    def build_inference_vector(self, user_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compiles calculated features into a unified vector for model consumption.
        """
        completed_tasks = user_context.get('completed_tasks', [])
        goals = user_context.get('goals', [])
        skill_history = user_context.get('skill_history', [])
        work_hours = user_context.get('work_hours', [])
        completion_rates = user_context.get('completion_rates', [])
        safe_rates = _finite_values(completion_rates) if isinstance(completion_rates, list) else []
        
        return {
            "task_velocity": self.compute_task_velocity(completed_tasks),
            "goal_momentum": self.compute_goal_momentum(goals),
            "skill_growth_rate": self.compute_skill_growth_rate(skill_history),
            "burnout_risk": self.compute_burnout_risk_score(work_hours if isinstance(work_hours, list) else [], safe_rates),
            "time_management_score": float(np.mean(np.clip(safe_rates, 0.0, 1.0)) * 100) if safe_rates else 50.0
        }
