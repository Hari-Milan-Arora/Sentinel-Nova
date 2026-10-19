"""
Core Prediction Service for Sentinel Nova
Orchestrates training, evaluation, feature updates, and model monitoring logs.
"""

import time
import numpy as np
from typing import Dict, List, Any
from ml.prediction_engine.feature_engineering import FeatureEngineer
from ml.prediction_engine.prediction_models import (
    TaskCompletionModel,
    DeadlineRiskModel,
    CareerReadinessModel,
    ResumeEvolutionModel,
    ProductivityTrendModel,
    BurnoutRiskModel
)


def _finite_number(value: Any, default: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if np.isfinite(number) else default

class PredictionService:
    def __init__(self):
        self.feature_engineer = FeatureEngineer()
        self.task_model = TaskCompletionModel()
        self.risk_model = DeadlineRiskModel()
        self.career_model = CareerReadinessModel()
        self.resume_model = ResumeEvolutionModel()
        self.prod_model = ProductivityTrendModel()
        self.burnout_model = BurnoutRiskModel()
        
        # No fitted artifact or real labeled evaluation set is checked in.
        self.metrics_history = {
            "status": "not_evaluated",
            "trained_model_available": False,
            "metrics": None,
        }

    def train_models(self, training_dataset: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Training is intentionally unavailable until real, labeled, leakage-checked outcomes
        and an implemented estimator are provided. Never report simulated training as success.
        """
        return {
            "status": "blocked_insufficient_validated_data",
            "trained_model_available": False,
            "reason": "No real labeled task outcome dataset or implemented fitted estimator is available.",
            "records_received": len(training_dataset) if isinstance(training_dataset, list) else 0,
            "metrics": None,
        }

    def generate_full_prediction_dashboard(self, user_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculates all predictions for tasks, goals, burnout, career, opportunities, and recommendations.
        """
        if not isinstance(user_context, dict):
            user_context = {}

        # 1. Feature Engineering
        features = self.feature_engineer.build_inference_vector(user_context)
        
        # 2. Model 1 & 2: Task predictions
        raw_tasks = user_context.get('tasks', [])
        raw_tasks = [task for task in raw_tasks if isinstance(task, dict)] if isinstance(raw_tasks, list) else []
        tasks_predicted = []
        for t in raw_tasks:
            pred = self.task_model.predict(
                priority=t.get('priority', 'medium'),
                est_hours=t.get('estimatedHours', 4.0),
                past_rate=features['time_management_score'],
                days_rem=t.get('daysRemaining', 3.0),
                difficulty=t.get('difficulty', 'medium')
            )
            days_remaining = _finite_number(t.get('daysRemaining'), 3.0)
            risk = self.risk_model.predict(pred['probability'], days_remaining, t.get('priority', 'medium'))
            
            # Predict dynamic date
            epoch_days = int(days_remaining * (1.1 if risk in ['high', 'critical'] else 0.95))
            predicted_date = f"In {max(1, epoch_days)} days"
            
            tasks_predicted.append({
                "id": t.get('id', 't_unknown'),
                "title": t.get('title', ''),
                "completionProbability": int(pred['probability'] * 100),
                "predictedCompletionDate": predicted_date,
                "delayRisk": risk,
                "timeAllocationHours": pred['required_velocity_hours_per_day'],
                "predictionSource": "deterministic_heuristic",
                "dataSufficiency": "insufficient_for_trained_prediction"
            })
            
        # 3. Model 3: Career Readiness
        skills = user_context.get('skills', [])
        skills = [skill for skill in skills if isinstance(skill, dict)] if isinstance(skills, list) else []
        target_skills = ["TensorFlow", "PyTorch", "Transformers", "Hyperparameter Search", "Vertex AI", "System Design"]
        career_pred = self.career_model.predict(skills, target_skills)
        
        # 4. Model 4: Resume Quality
        resume_history = user_context.get('resume_history', [{"score": 75}])
        resume_history = [version for version in resume_history if isinstance(version, dict)] if isinstance(resume_history, list) else []
        resume_pred = self.resume_model.predict(resume_history, len(skills))
        
        # No validated relationship exists between task-count velocity and goal progress.
        goals = user_context.get('goals', [])
        goals = [goal for goal in goals if isinstance(goal, dict)] if isinstance(goals, list) else []
        goals_predicted = []
        for g in goals:
            goals_predicted.append({
                "id": g.get('id', ''),
                "title": g.get('title', ''),
                "successProbability": None,
                "failureProbability": None,
                "predictedMilestoneDelay": None,
                "riskLevel": "unknown",
                "predictionSource": "deterministic_heuristic",
                "dataSufficiency": "insufficient_for_trained_prediction",
                "aiRecoveryPlan": [],
                "reasoning": "Goal success probability is unavailable: task-count velocity is not a validated measure of goal-progress velocity."
            })
            
        # 6. Model 8 & 9: Burnout & Productivity
        prod_history = user_context.get('productivity_history', [])
        prod_history = prod_history if isinstance(prod_history, list) else []
        forecast_prod = self.prod_model.forecast(prod_history, 7) if prod_history else []
        
        work_hours = user_context.get('work_hours_history', [])
        work_hours = work_hours if isinstance(work_hours, list) else []
        burnout = self.burnout_model.predict(work_hours, off_days=user_context.get('off_days', 0))
        
        # 7. Model 10: Ranked Recommendations
        # The former recommendation list was hard-coded demo content, not user-grounded output.
        ranked_recs = []
        
        return {
            "timestamp": time.time(),
            "predictionSource": "deterministic_heuristic",
            "dataSufficiency": "insufficient_for_trained_prediction",
            "features": features,
            "tasks": tasks_predicted,
            "goals": goals_predicted,
            "career": {
                "currentReadiness": career_pred['current_readiness'],
                "forecast30Days": career_pred['forecast_30_days'],
                "forecast90Days": career_pred['forecast_90_days'],
                "interviewProbability": int(career_pred['current_readiness'] * 0.95),
                "skillsGap": career_pred['skills_gap']
            },
            "resume": {
                "atsScore": resume_pred['current_ats'],
                "atsForecast30Days": resume_pred['expected_ats_90d'],
                "hiringProbability": int(resume_pred['expected_ats_90d'] * 0.88),
                "trajectory": resume_pred['trajectory']
            },
            "burnout": {
                "burnoutRisk": burnout['risk_level'],
                "burnoutScore": burnout['burnout_score'],
                "requiresCooldown": burnout['requires_cooldown'],
                "productivityTrend": forecast_prod,
                "recoverySuggestions": [] if burnout['risk_level'] == 'unknown' else [
                    "Review recent work hours and plan a sustainable stop time."
                ],
                "predictionSource": "deterministic_heuristic",
                "dataSufficiency": burnout.get('data_sufficiency', 'insufficient')
            },
            "rankedRecommendations": ranked_recs,
            "monitoring": self.metrics_history
        }
