"""Re-evaluate the saved lead-time artifact on its reproducible chronological test split."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from ml.prediction_engine.task_lead_time import MODEL_VERSION, load_saved_model
from ml.training.dataset import chronological_split, discover_dataset, prepare_dataset
from ml.training.train import ROOT, _atomic_json, metrics


def evaluate_performance() -> dict:
    """Legacy rule-generated diagnostic, explicitly not real-world evaluation."""
    from ml.datasets.synthetic_generator import SyntheticDatasetGenerator
    from ml.prediction_engine.prediction_models import TaskCompletionModel

    records = SyntheticDatasetGenerator(seed=101).generate_task_telemetry(150)
    model = TaskCompletionModel()
    actual = [bool(row["completedOnTime"]) for row in records]
    predicted = [
        model.predict(
            priority=row["priority"],
            est_hours=row["estimatedHours"],
            past_rate=82.5,
            days_rem=row["daysRemaining"],
            difficulty=row["difficulty"],
        )["probability"] >= 0.50
        for row in records
    ]
    accuracy = sum(left == right for left, right in zip(actual, predicted)) / len(actual)
    return {
        "status": "synthetic_diagnostic_only",
        "real_world_performance_estimated": False,
        "metrics": {"accuracy": accuracy},
        "warning": "Synthetic labels are generated from rules and are not validation of real-world performance.",
    }


def evaluate(dataset_path: Path, artifact_dir: Path, report_path: Path) -> dict:
    prepared = prepare_dataset(dataset_path)
    model, manifest = load_saved_model(artifact_dir)
    if manifest["dataset"]["sha256"] != prepared.source_sha256:
        raise ValueError("dataset_checksum_does_not_match_trained_artifact")

    train_rows, validation_rows, test_rows = chronological_split(prepared.rows)
    fit_rows = pd.concat([train_rows, validation_rows], axis=0)
    y_test = test_rows["_lead_time_days"].to_numpy(dtype=float)
    predictions = np.maximum(0.0, np.asarray(model.predict(test_rows[["Summary"]]), dtype=float))
    baseline_value = float(fit_rows["_lead_time_days"].median())
    results = {
        "baseline_training_median": metrics(y_test, np.full(len(y_test), baseline_value)),
        "trained_model": metrics(y_test, predictions),
    }
    report = {
        "model_version": MODEL_VERSION,
        "dataset_filename": prepared.source_path.name,
        "dataset_sha256": prepared.source_sha256,
        "target_name": manifest["target"]["name"],
        "target_units": manifest["target"]["units"],
        "split_method": manifest["split"]["method"],
        "sample_counts": manifest["split"]["sample_counts"],
        "test_metrics": results,
        "beats_baseline_on_test_mae": bool(results["trained_model"]["mae_days"] < results["baseline_training_median"]["mae_days"]),
        "artifact_sha256": manifest["artifact"]["sha256"],
        "limitations": manifest["limitations"],
    }
    _atomic_json(report_path.resolve(), report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument("--artifact-dir", type=Path, default=ROOT / "ml" / "models")
    parser.add_argument("--report", type=Path, default=ROOT / "ml" / "reports" / f"{MODEL_VERSION}-evaluation.json")
    args = parser.parse_args()
    dataset = args.dataset
    if dataset is None:
        workbooks = [p for p in discover_dataset(ROOT) if p.suffix.lower() in {".xlsx", ".xls"}]
        if len(workbooks) != 1:
            parser.error(f"Expected exactly one root-level Excel dataset; discovered {len(workbooks)}")
        dataset = workbooks[0]
    report = evaluate(dataset, args.artifact_dir, args.report)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
