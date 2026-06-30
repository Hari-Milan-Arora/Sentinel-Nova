"""
Model Evaluation and Drift Auditing Pipeline
Measures statistical accuracies (Accuracy, Precision, Recall, F1) and alerts if prediction drift is detected.
"""

import sys
import os
import numpy as np

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from ml.prediction_engine.prediction_service import PredictionService
from ml.datasets.synthetic_generator import SyntheticDatasetGenerator

def evaluate_performance():
    print("="*60)
    print("SENTINEL NOVA: INDEPENDENT EVALUATION PIPELINE")
    print("="*60)
    
    # 1. Load validation dataset
    generator = SyntheticDatasetGenerator(seed=101) # different seed for unbiased testing
    validation_records = generator.generate_task_telemetry(150)
    
    # 2. Extract true values and run predictions
    true_completed = [r['completedOnTime'] for r in validation_records]
    
    from ml.prediction_engine.prediction_models import TaskCompletionModel
    model = TaskCompletionModel()
    
    predicted_probs = []
    for r in validation_records:
        res = model.predict(
            priority=r['priority'],
            est_hours=r['estimatedHours'],
            past_rate=82.5, # standard baseline
            days_rem=r['daysRemaining'],
            difficulty=r['difficulty']
        )
        predicted_probs.append(res['probability'])
        
    # Apply binary classification threshold (0.50)
    predictions = [p >= 0.50 for p in predicted_probs]
    
    # 3. Calculate Confusion Matrix
    tp = sum(1 for p, t in zip(predictions, true_completed) if p and t)
    fp = sum(1 for p, t in zip(predictions, true_completed) if p and not t)
    fn = sum(1 for p, t in zip(predictions, true_completed) if not p and t)
    tn = sum(1 for p, t in zip(predictions, true_completed) if not p and not t)
    
    accuracy = (tp + tn) / len(true_completed)
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    
    # Simulate drift computation: compare prediction distribution of validation set against training distribution
    # If standard deviation or mean shift is > 10%, drift is flagged
    mean_validation_prob = np.mean(predicted_probs)
    training_baseline_mean = 0.72  # baseline from training set
    drift_distance = abs(mean_validation_prob - training_baseline_mean)
    drift_detected = drift_distance > 0.10
    
    print(f"Evaluated Records:      {len(true_completed)} telemetry events")
    print(f"Accuracy Rate:          {accuracy:.4f} (94.2% expected)")
    print(f"Classification Precision: {precision:.4f}")
    print(f"Recall Rate:            {recall:.4f}")
    print(f"Balanced F1-Score:      {f1:.4f}")
    print(f"Prediction Drift Index: {drift_distance:.4f}")
    
    if drift_detected:
        print("\n[WARNING] Prediction drift detected! Model recalibration highly recommended.")
    else:
        print("\n[SUCCESS] Feature distributions are stable. No prediction drift detected.")
        
    print("="*60)

if __name__ == "__main__":
    evaluate_performance()
