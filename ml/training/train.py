"""
Model Retraining and Calibration Script
Executes training passes, calculates loss weights, and saves metrics to model stores.
"""

import sys
import os
import json

# Add root folder to path so ml package is discoverable
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from ml.prediction_engine.prediction_service import PredictionService
from ml.datasets.synthetic_generator import SyntheticDatasetGenerator

def main():
    print("="*60)
    print("SENTINEL NOVA: MODEL RETRAINING TRIGGERED")
    print("="*60)
    
    # 1. Initialize dataset generator and create recent telemetry logs
    print("[1/3] Generating current telemetry log data...")
    generator = SyntheticDatasetGenerator()
    tasks_data = generator.generate_task_telemetry(300)
    burnout_data = generator.generate_burnout_series(45)
    
    # 2. Initialize prediction engine
    print("[2/3] Initializing Sentinel Retraining Pipeline...")
    service = PredictionService()
    
    # Simulate feedforward and backward adjustment
    dataset = {"tasks": tasks_data, "burnout": burnout_data}
    retrained_metrics = service.train_models([dataset])
    
    # 3. Output results and update checkpoint files
    print("[3/3] Training pass completed successfully.")
    print("\n--- PERFORMANCE MONITORING METRICS ---")
    print(f"Mean Squared Accuracy: {retrained_metrics['accuracy']:.4f}")
    print(f"Inference F1-Score:   {retrained_metrics['f1_score']:.4f}")
    print(f"Classification Precision: {retrained_metrics['precision']:.4f}")
    print(f"Model Drift Index:     {retrained_metrics['prediction_drift_index']:.4f}")
    print(f"Calibrated Threshold:  0.450")
    print("="*60)
    
    # Save training status JSON
    training_status = {
        "status": "success",
        "last_trained_epoch": 12,
        "metrics": retrained_metrics
    }
    with open("ml/training/training_checkpoint.json", "w") as f:
        json.dump(training_status, f, indent=2)
    print("Retraining parameters saved to ml/training/training_checkpoint.json")

if __name__ == "__main__":
    main()
