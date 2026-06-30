"""
Single-Query Prediction Inference Tool
Processes user query payloads and outputs fully quantified predictions.
"""

import sys
import os
import json

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from ml.prediction_engine.prediction_service import PredictionService

def run_test_inference():
    print("Executing single-record inference pass on active digital twin context...")
    
    # Define a test sample user context
    test_user_context = {
        "tasks": [
            {"id": "t1", "title": "Implement multi-agent memory loop", "priority": "high", "estimatedHours": 6.5, "daysRemaining": 2},
            {"id": "t2", "title": "Refactor router configurations", "priority": "low", "estimatedHours": 2.0, "daysRemaining": 5}
        ],
        "goals": [
            {"id": "g1", "title": "Optimize Gemini Fine-Tuning Hyperparameters", "progress": 85.0, "daysRemaining": 8}
        ],
        "skills": [
            {"name": "Transformers", "score": 80},
            {"name": "Vertex AI", "score": 75}
        ],
        "productivity_history": [75, 82, 70, 68, 80, 85, 78],
        "work_hours_history": [8.5, 9.0, 10.0, 8.0, 8.5, 9.5, 8.0],
        "off_days": 1
    }
    
    service = PredictionService()
    results = service.generate_full_prediction_dashboard(test_user_context)
    
    print("\n--- INFERENCE RESULTS ---")
    print(f"Task Completion Probabilities:")
    for t in results['tasks']:
        print(f"  - '{t['title']}': {t['completionProbability']}% probability (Risk: {t['delayRisk'].upper()})")
        
    print(f"\nGoal Success Estimations:")
    for g in results['goals']:
        print(f"  - '{g['title']}': {g['successProbability']}% success, {g['failureProbability']}% failure")
        
    print(f"\nBurnout Evaluation:")
    print(f"  - Burnout Risk Score: {results['burnout']['burnoutScore']}/100 ({results['burnout']['burnoutRisk'].upper()} RISK)")
    print(f"  - Recommended recovery advice: '{results['burnout']['recoverySuggestions'][0]}'")
    
    print("\nInference executed successfully.")

if __name__ == "__main__":
    run_test_inference()
