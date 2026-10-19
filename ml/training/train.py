"""Train and evaluate the real-data task completion lead-time model."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import tempfile

import joblib
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, median_absolute_error, r2_score

from ml.prediction_engine.task_lead_time import (
    FEATURE_SCHEMA,
    MODEL_VERSION,
    TARGET_NAME,
    TARGET_UNITS,
    build_pipeline,
)
from ml.training.dataset import chronological_split, discover_dataset, prepare_dataset


ROOT = Path(__file__).resolve().parents[2]
SOURCE_URL = "https://data.mendeley.com/datasets/249h53865h/4"
DATASET_VERSION = "Mendeley Data v4; DOI 10.17632/249h53865h.4"
DATASET_LICENSE = "CC BY 4.0 as stated on the versioned Mendeley Data record"
ALPHAS = (0.1, 1.0, 10.0, 100.0)
SEED = 20261019
LIMITATIONS = [
    "The workbook contains only resolved rows with Status=Done; metrics are conditional on this selected completed-task sample.",
    "The dataset is Jira software-task data; estimates may not generalize to personal or non-software tasks.",
    "Summary is the only model feature. The workbook has no revision history, so title edits after creation cannot be ruled out.",
    "Created and Resolved Excel timestamps are timezone-naive; lead time is computed as their naive timestamp difference.",
    "Predicted lead time is elapsed calendar time, not active effort or focused work duration.",
    "The dataset has no stable task identifier and one repeated Summary group; those rows are excluded to prevent title leakage.",
    "The model is evaluated on one chronological held-out slice and is not calibrated or production-validated.",
]


def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float | int]:
    predictions = np.maximum(0.0, np.asarray(y_pred, dtype=float))
    return {
        "sample_count": int(len(y_true)),
        "mae_days": float(mean_absolute_error(y_true, predictions)),
        "rmse_days": float(np.sqrt(mean_squared_error(y_true, predictions))),
        "median_absolute_error_days": float(median_absolute_error(y_true, predictions)),
        "r2": float(r2_score(y_true, predictions)) if len(y_true) > 1 else float("nan"),
    }


def _atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp") as handle:
        json.dump(value, handle, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False)
        temporary = Path(handle.name)
    os.replace(temporary, path)


def train(dataset_path: Path, artifact_dir: Path, report_path: Path, seed: int = SEED) -> dict:
    np.random.seed(seed)
    prepared = prepare_dataset(dataset_path)
    train_rows, validation_rows, test_rows = chronological_split(prepared.rows)

    validation_results = []
    for alpha in ALPHAS:
        candidate = build_pipeline(alpha)
        candidate.fit(train_rows[FEATURE_SCHEMA], train_rows["_lead_time_days"].to_numpy())
        val_predictions = np.maximum(0.0, candidate.predict(validation_rows[FEATURE_SCHEMA]))
        validation_results.append({
            "alpha": alpha,
            "mae_days": float(mean_absolute_error(validation_rows["_lead_time_days"], val_predictions)),
        })
    selected = min(validation_results, key=lambda item: (item["mae_days"], item["alpha"]))

    train_validation = np.concatenate([train_rows.index.to_numpy(), validation_rows.index.to_numpy()])
    fit_rows = prepared.rows.loc[train_validation]
    final_model = build_pipeline(selected["alpha"])
    final_model.fit(fit_rows[FEATURE_SCHEMA], fit_rows["_lead_time_days"].to_numpy())

    test_y = test_rows["_lead_time_days"].to_numpy(dtype=float)
    trained_predictions = np.maximum(0.0, final_model.predict(test_rows[FEATURE_SCHEMA]))
    baseline_value = float(fit_rows["_lead_time_days"].median())
    baseline_predictions = np.full(len(test_rows), baseline_value, dtype=float)
    test_metrics = {
        "baseline_training_median": metrics(test_y, baseline_predictions),
        "trained_model": metrics(test_y, trained_predictions),
    }
    training_beats_baseline = (
        test_metrics["trained_model"]["mae_days"] < test_metrics["baseline_training_median"]["mae_days"]
    )

    artifact_dir = artifact_dir.resolve()
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / f"{MODEL_VERSION}.joblib"
    with tempfile.NamedTemporaryFile("wb", dir=artifact_dir, delete=False, suffix=".joblib.tmp") as handle:
        temporary_artifact = Path(handle.name)
    try:
        joblib.dump(final_model, temporary_artifact, compress=3)
        os.replace(temporary_artifact, artifact_path)
    finally:
        if temporary_artifact.exists():
            temporary_artifact.unlink()

    import hashlib
    artifact_digest = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    report = {
        "report_version": 1,
        "model_version": MODEL_VERSION,
        "training_timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "filename": prepared.source_path.name,
            "size_bytes": prepared.source_path.stat().st_size,
            "sha256": prepared.source_sha256,
            "source_url": SOURCE_URL,
            "version": DATASET_VERSION,
            "license": DATASET_LICENSE,
            "sheet_name": prepared.sheet_name,
            "source_row_count": prepared.audit["source_rows"],
            "usable_row_count": prepared.audit["usable_rows"],
            "observed_columns": [str(column) for column in __import__("pandas").read_excel(prepared.source_path, sheet_name=prepared.sheet_name, nrows=0).columns],
            "exclusion_counts": prepared.audit,
        },
        "target": {
            "name": TARGET_NAME,
            "definition": "(Resolved - Created).total_seconds() / 86400",
            "units": TARGET_UNITS,
            "semantics": "Elapsed calendar days from task creation to resolution; not active work duration.",
            "distribution_days": prepared.audit["target_summary_days"],
        },
        "features": {
            "feature_schema": FEATURE_SCHEMA,
            "included": ["Summary (task title text)"],
            "excluded": ["Status", "Priority", "Created", "Resolved", "Labels", "Description", "Task identifiers (none present)"],
            "reason": "Post-outcome status/resolution are leakage; mutable fields lack point-in-time history; Created is used only for target and split.",
        },
        "split": {
            "method": "chronological_sorted_by_Created",
            "ratios": {"train": 0.70, "validation": 0.15, "test": 0.15},
            "sample_counts": {
                "train": int(len(train_rows)),
                "validation": int(len(validation_rows)),
                "final_fit_train_plus_validation": int(len(fit_rows)),
                "test": int(len(test_rows)),
            },
            "created_ranges": {
                "train": [train_rows["_created_at"].min().isoformat(), train_rows["_created_at"].max().isoformat()],
                "validation": [validation_rows["_created_at"].min().isoformat(), validation_rows["_created_at"].max().isoformat()],
                "test": [test_rows["_created_at"].min().isoformat(), test_rows["_created_at"].max().isoformat()],
            },
        },
        "training": {
            "random_seed": seed,
            "library_versions": _library_versions(),
            "candidate_model": "TF-IDF word unigram/bigram + Ridge regression on log1p(lead_time_days)",
            "validation_alpha_results": validation_results,
            "selected_alpha": selected["alpha"],
            "test_metrics": test_metrics,
            "beats_baseline_on_test_mae": bool(training_beats_baseline),
            "interpretation": "Point estimate only; no calibrated interval or completion-probability output.",
        },
        "artifact": {
            "filename": artifact_path.name,
            "sha256": artifact_digest,
            "format": "joblib scikit-learn TransformedTargetRegressor pipeline",
        },
        "limitations": LIMITATIONS,
    }
    manifest_path = artifact_dir / f"{MODEL_VERSION}.json"
    _atomic_json(manifest_path, report)
    _atomic_json(report_path.resolve(), report)
    return report


def _library_versions() -> dict[str, str]:
    import joblib
    import pandas
    import sklearn
    return {
        "python": __import__("sys").version.split()[0],
        "numpy": np.__version__,
        "pandas": pandas.__version__,
        "scikit_learn": sklearn.__version__,
        "joblib": joblib.__version__,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=None, help="Dataset workbook; defaults to discovered repository-root XLSX")
    parser.add_argument("--artifact-dir", type=Path, default=ROOT / "ml" / "models")
    parser.add_argument("--report", type=Path, default=ROOT / "ml" / "reports" / f"{MODEL_VERSION}.json")
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    dataset = args.dataset
    if dataset is None:
        discovered = discover_dataset(ROOT)
        workbooks = [path for path in discovered if path.suffix.lower() in {".xlsx", ".xls"}]
        if len(workbooks) != 1:
            parser.error(f"Expected exactly one root-level Excel dataset; discovered {len(workbooks)}")
        dataset = workbooks[0]

    result = train(dataset, args.artifact_dir, args.report, args.seed)
    print(json.dumps({
        "status": "trained_and_evaluated",
        "model_version": result["model_version"],
        "dataset": result["dataset"],
        "split_sample_counts": result["split"]["sample_counts"],
        "test_metrics": result["training"]["test_metrics"],
        "beats_baseline_on_test_mae": result["training"]["beats_baseline_on_test_mae"],
        "artifact": result["artifact"],
        "report": str(args.report.resolve()),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
