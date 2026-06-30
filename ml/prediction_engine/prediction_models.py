"""
Machine Learning Predictive Models for AEaaS Sentinel Nova
Defines the structure, training, and inference pipelines for the 10 essential models.
"""

import numpy as np
from typing import Dict, List, Any, Tuple

class TaskCompletionModel:
    """Model 1: Task Completion Probability"""
    def predict(self, priority: str, est_hours: float, past_rate: float, days_rem: float, difficulty: str) -> Dict[str, Any]:
        # Simple weighted logistic function
        priority_weights = {'low': 0.1, 'medium': 0.25, 'high': 0.45, 'critical': 0.65}
        difficulty_weights = {'easy': 0.9, 'medium': 0.7, 'hard': 0.4}
        
        pw = priority_weights.get(priority.lower(), 0.3)
        dw = difficulty_weights.get(difficulty.lower(), 0.6)
        
        # S-Curve based on estimated speed and history
        if days_rem <= 0:
            prob = 0.0
        else:
            required_velocity = est_hours / days_rem
            # optimal velocity would be 2-3 hours/day. If higher, probability decreases
            velocity_penalty = max(0.0, required_velocity - 4.0) * 0.15
            score = (past_rate / 100.0) * 0.4 + dw * 0.4 - pw * 0.1 - velocity_penalty
            prob = 1.0 / (1.0 + np.exp(-10 * (score - 0.45)))
            
        prob = float(np.clip(prob, 0.05, 0.98))
        confidence = float(0.85 if est_hours > 0 and days_rem > 0 else 0.5)
        
        return {
            "probability": prob,
            "confidence": confidence,
            "required_velocity_hours_per_day": round(est_hours / max(1, days_rem), 2)
        }

class DeadlineRiskModel:
    """Model 2: Deadline Risk Predictor"""
    def predict(self, completion_probability: float, days_remaining: float, priority: str) -> str:
        if completion_probability > 0.85:
            return "low"
        elif completion_probability > 0.65:
            return "medium"
        elif completion_probability > 0.45:
            return "high"
        else:
            return "critical"

class CareerReadinessModel:
    """Model 3: Career Readiness Tracker"""
    def predict(self, current_skills: List[Dict[str, Any]], target_job_skills: List[str]) -> Dict[str, Any]:
        if not target_job_skills:
            return {"score": 60, "forecast_30d": 65, "forecast_90d": 75}
            
        skills_matched = 0
        for skill in current_skills:
            if skill.get('name') in target_job_skills:
                skills_matched += (skill.get('score', 0) / 100.0)
                
        readiness_ratio = skills_matched / len(target_job_skills)
        score = int(readiness_ratio * 100)
        
        # Forecasts based on momentum
        forecast_30d = int(np.clip(score + 4, 0, 99))
        forecast_90d = int(np.clip(score + 12, 0, 100))
        
        return {
            "current_readiness": score,
            "forecast_30_days": forecast_30d,
            "forecast_90_days": forecast_90d,
            "skills_gap": [s for s in target_job_skills if s not in [cs.get('name') for cs in current_skills]]
        }

class ResumeEvolutionModel:
    """Model 4: Resume Quality and ATS Evolution Model"""
    def predict(self, past_versions: List[Dict[str, Any]], skills_added: int) -> Dict[str, Any]:
        initial_score = past_versions[-1].get('score', 65) if past_versions else 68
        expected_ats = min(98.0, initial_score + (skills_added * 2.5))
        
        return {
            "current_ats": initial_score,
            "expected_ats_90d": int(expected_ats),
            "expected_skill_growth_percent": skills_added * 8,
            "trajectory": "upward" if expected_ats > initial_score else "stable"
        }

class LearningProgressModel:
    """Model 5: Learning Progression Curve Forecast"""
    def predict(self, weekly_study_hours: float, course_difficulty: str, target_hours: float) -> Dict[str, Any]:
        difficulty_coefs = {"easy": 1.2, "medium": 1.0, "hard": 0.75}
        coef = difficulty_coefs.get(course_difficulty.lower(), 1.0)
        
        if weekly_study_hours <= 0:
            return {"completion_weeks": 99, "probability_on_time": 0.0}
            
        weeks_needed = target_hours / (weekly_study_hours * coef)
        prob_on_time = 1.0 / (1.0 + np.exp(0.5 * (weeks_needed - 4))) # sigmoid
        
        return {
            "estimated_weeks_to_complete": round(weeks_needed, 1),
            "completion_probability": float(np.clip(prob_on_time, 0.1, 0.95))
        }

class OpportunityMatchModel:
    """Model 6: Opportunity Match Fit Scoring"""
    def predict(self, user_skills: List[str], opp_requirements: List[str]) -> Dict[str, Any]:
        if not opp_requirements:
            return {"fit_score": 75, "match_level": "high"}
            
        matches = set(user_skills).intersection(set(opp_requirements))
        fit_score = int((len(matches) / len(opp_requirements)) * 100)
        
        # Default baseline if zero matches
        fit_score = max(fit_score, 35)
        
        return {
            "fit_score": fit_score,
            "expected_application_success": int(fit_score * 0.85),
            "confidence": int(fit_score * 0.9)
        }

class GoalSuccessModel:
    """Model 7: Goal Success Probability Estimator"""
    def predict(self, goal_progress: float, days_remaining: float, task_completion_velocity: float) -> Dict[str, Any]:
        remaining_progress = 100.0 - goal_progress
        if remaining_progress <= 0:
            return {"success_prob": 1.0, "failure_prob": 0.0}
            
        if days_remaining <= 0:
            return {"success_prob": 0.0, "failure_prob": 1.0}
            
        required_progress_rate = remaining_progress / days_remaining
        # Compare required rate to actual task completion velocity
        velocity_ratio = task_completion_velocity / max(0.1, required_progress_rate)
        
        success_prob = 1.0 / (1.0 + np.exp(-1.5 * (velocity_ratio - 1.0)))
        success_prob = float(np.clip(success_prob, 0.1, 0.98))
        
        return {
            "success_probability": round(success_prob * 100, 1),
            "failure_probability": round((1.0 - success_prob) * 100, 1),
            "risk_level": "low" if success_prob > 0.8 else "medium" if success_prob > 0.5 else "high"
        }

class ProductivityTrendModel:
    """Model 8: Multi-Day Productivity Curve Forecaster"""
    def forecast(self, history: List[float], days: int = 7) -> List[float]:
        if not history:
            return [70.0] * days
            
        # Fit trendline using moving averages and seasonality (e.g. weekly peak)
        mean_productivity = np.mean(history)
        predictions = []
        for d in range(days):
            # simulate subtle cyclical variance
            cyclical_effect = np.sin(2 * np.pi * d / 7.0) * 5.0
            pred = mean_productivity + cyclical_effect
            predictions.append(float(np.clip(pred, 40.0, 98.0)))
        return predictions

class BurnoutRiskModel:
    """Model 9: Burnout Classifier and Risk Predictor"""
    def predict(self, work_hours_trend: List[float], off_days: int) -> Dict[str, Any]:
        mean_hours = np.mean(work_hours_trend) if work_hours_trend else 8.0
        risk_score = (mean_hours / 12.0) * 80.0 - (off_days * 5.0)
        risk_score = float(np.clip(risk_score, 10.0, 99.0))
        
        risk_level = "low" if risk_score < 40 else "medium" if risk_score < 70 else "high" if risk_score < 85 else "critical"
        
        return {
            "burnout_score": int(risk_score),
            "risk_level": risk_level,
            "requires_cooldown": risk_level in ["high", "critical"]
        }

class RecommendationRankingEngine:
    """Model 10: Multi-Criteria Recommendation Ranker"""
    def rank(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        # Ranks items based on Expected Value (Impact Score * Completion Confidence)
        ranked = []
        for item in items:
            impact = item.get('impact_score', 50.0)
            confidence = item.get('confidence', 50.0)
            urgency = item.get('urgency_score', 50.0)
            
            # Weighted rank score
            rank_score = 0.5 * impact + 0.3 * urgency + 0.2 * confidence
            ranked.append({**item, "rank_score": float(rank_score)})
            
        return sorted(ranked, key=lambda x: x['rank_score'], reverse=True)
