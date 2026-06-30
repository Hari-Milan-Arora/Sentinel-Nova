"""
Synthetic Telemetry Dataset Generator for Sentinel Nova
Creates realistic synthetic timeseries data for training, validation, and testing of predictive models.
"""

import json
import random
import numpy as np
from typing import Dict, List, Any

class SyntheticDatasetGenerator:
    def __init__(self, seed: int = 42):
        random.seed(seed)
        np.random.seed(seed)

    def generate_task_telemetry(self, num_records: int = 100) -> List[Dict[str, Any]]:
        tasks = []
        priorities = ['low', 'medium', 'high', 'critical']
        difficulties = ['easy', 'medium', 'hard']
        status_options = ['todo', 'in_progress', 'done']
        
        for i in range(num_records):
            priority = random.choice(priorities)
            difficulty = random.choice(difficulties)
            est_hours = round(random.uniform(1.0, 16.0), 1)
            days_rem = random.randint(1, 15)
            
            # Simulate historical completion status based on factors
            # High difficulty + low days remaining -> less likely to be done
            success_chance = 0.85
            if difficulty == 'hard':
                success_chance -= 0.2
            if days_rem < 3:
                success_chance -= 0.15
            if priority == 'critical':
                success_chance += 0.1
                
            is_completed = random.random() < success_chance
            status = 'done' if is_completed else random.choice(['todo', 'in_progress'])
            
            tasks.append({
                "id": f"task_{i+1:03d}",
                "title": f"Telemetry Task {i+1:03d}",
                "priority": priority,
                "status": status,
                "estimatedHours": est_hours,
                "daysRemaining": days_rem,
                "difficulty": difficulty,
                "completedOnTime": is_completed
            })
            
        return tasks

    def generate_burnout_series(self, num_days: int = 30) -> Dict[str, Any]:
        work_hours = []
        productivity = []
        
        # Simulating base load
        base_load = 8.0
        for day in range(num_days):
            # add weekly cycle (workdays vs weekend)
            is_weekend = (day % 7) in [5, 6]
            if is_weekend:
                hours = random.uniform(0.0, 3.0)
                prod = random.uniform(20.0, 50.0)
            else:
                hours = base_load + random.uniform(-1.5, 3.5)
                # Productivity degrades if working hours exceed 10 hours repeatedly (burnout)
                if hours > 10.0:
                    prod = max(30.0, 90.0 - (hours - 10.0) * 12.0 + random.uniform(-5.0, 5.0))
                else:
                    prod = random.uniform(70.0, 95.0)
            work_hours.append(round(hours, 1))
            productivity.append(round(prod, 1))
            
        return {
            "work_hours": work_hours,
            "productivity": productivity
        }

    def save_to_file(self, filename: str, data: Any):
        with open(filename, 'w') as f:
            json.dump(data, f, indent=2)

if __name__ == "__main__":
    gen = SyntheticDatasetGenerator()
    tasks_data = gen.generate_task_telemetry(250)
    burnout_data = gen.generate_burnout_series(60)
    
    combined = {
        "tasks": tasks_data,
        "burnout": burnout_data
    }
    gen.save_to_file("ml/datasets/synthetic_telemetry.json", combined)
    print("Generated synthetic dataset at ml/datasets/synthetic_telemetry.json")
