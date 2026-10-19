"""Reproduce split diagnostics for the saved lead-time model without test tuning."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, median_absolute_error, r2_score

from ml.prediction_engine.task_lead_time import FEATURE_SCHEMA, MODEL_VERSION, build_pipeline, load_saved_model
from ml.training.dataset import chronological_split, discover_dataset, prepare_dataset
from ml.training.train import ROOT, _atomic_json


MIN_SUBGROUP_N = 20
TARGET_BINS = [0, 30, 365, 730, np.inf]
TARGET_BIN_NAMES = ["0-30", "30-365", "365-730", "730+"]


def regression_metrics(actual: np.ndarray, prediction: np.ndarray) -> dict:
    actual = np.asarray(actual, dtype=float)
    prediction = np.maximum(0, np.asarray(prediction, dtype=float))
    return {
        "n": int(actual.size),
        "mae_days": float(mean_absolute_error(actual, prediction)),
        "rmse_days": float(np.sqrt(mean_squared_error(actual, prediction))),
        "median_absolute_error_days": float(median_absolute_error(actual, prediction)),
        "r2": float(r2_score(actual, prediction)) if actual.size >= 2 else None,
        "actual_mean_days": float(actual.mean()),
        "actual_std_days": float(actual.std(ddof=0)),
        "prediction_mean_days": float(prediction.mean()),
        "prediction_std_days": float(prediction.std(ddof=0)),
        "residual_mean_days": float((prediction - actual).mean()),
        "residual_median_days": float(np.median(prediction - actual)),
    }


def distribution(values: pd.Series) -> dict:
    array = values.to_numpy(dtype=float)
    return {
        "n": int(array.size),
        "min": float(np.min(array)),
        "p10": float(np.quantile(array, 0.10)),
        "p25": float(np.quantile(array, 0.25)),
        "median": float(np.median(array)),
        "mean": float(np.mean(array)),
        "p75": float(np.quantile(array, 0.75)),
        "p90": float(np.quantile(array, 0.90)),
        "p95": float(np.quantile(array, 0.95)),
        "p99": float(np.quantile(array, 0.99)),
        "max": float(np.max(array)),
        "std": float(np.std(array)),
    }


def subgroup_metrics(frame: pd.DataFrame, actual: np.ndarray, predicted: np.ndarray, column: str) -> list[dict]:
    output = []
    for value, indexes in frame.groupby(column, observed=False).groups.items():
        indexes = np.asarray(list(indexes), dtype=int)
        row = {"group": str(value), "n": int(indexes.size)}
        if indexes.size >= MIN_SUBGROUP_N:
            row.update(regression_metrics(actual[indexes], predicted[indexes]))
        else:
            row["metrics_suppressed"] = f"requires_n_at_least_{MIN_SUBGROUP_N}"
        output.append(row)
    return output


def analyze(dataset_path: Path, artifact_dir: Path, report_path: Path) -> dict:
    prepared = prepare_dataset(dataset_path)
    model, manifest = load_saved_model(artifact_dir)
    if manifest["dataset"]["sha256"] != prepared.source_sha256:
        raise ValueError("dataset_checksum_does_not_match_trained_artifact")

    train, validation, test = chronological_split(prepared.rows)
    selected_alpha = float(manifest["training"]["selected_alpha"])

    # Validation is also used to choose alpha, so these validation metrics are
    # explicitly descriptive/model-selection results, not an unbiased estimate.
    validation_model = build_pipeline(selected_alpha)
    validation_model.fit(train[FEATURE_SCHEMA], train["_lead_time_days"].to_numpy(dtype=float))
    predictions = {
        "train_in_sample": np.maximum(0, validation_model.predict(train[FEATURE_SCHEMA])),
        "validation_model_selection": np.maximum(0, validation_model.predict(validation[FEATURE_SCHEMA])),
        "test_held_out": np.maximum(0, model.predict(test[FEATURE_SCHEMA])),
    }
    split_frames = {"train": train, "validation": validation, "test": test}
    split_predictions = {
        "train": predictions["train_in_sample"],
        "validation": predictions["validation_model_selection"],
        "test": predictions["test_held_out"],
    }

    split_metrics = {}
    split_targets = {}
    target_bound = float(train["_lead_time_days"].quantile(0.99))
    title_lengths = {}
    for name, frame in split_frames.items():
        y = frame["_lead_time_days"].to_numpy(dtype=float)
        pred = split_predictions[name]
        split_targets[name] = distribution(frame["_lead_time_days"])
        split_metrics[name] = {
            "trained_model": regression_metrics(y, pred),
            "median_baseline": regression_metrics(y, np.full(y.size, float((train if name != "test" else pd.concat([train, validation]))["_lead_time_days"].median()))),
            "mean_baseline": regression_metrics(y, np.full(y.size, float((train if name != "test" else pd.concat([train, validation]))["_lead_time_days"].mean()))),
            "prediction_distribution_days": distribution(pd.Series(pred)),
            "residual_distribution_days": distribution(pd.Series(pred - y)),
            "train_p99_threshold_days": target_bound,
            "actual_above_train_p99_count": int(np.sum(y > target_bound)),
        }
        title_lengths[name] = {
            "characters": distribution(frame["Summary"].astype(str).str.len()),
            "whitespace_tokens": distribution(frame["Summary"].astype(str).str.split().str.len()),
        }

    test_frame = test.reset_index(drop=True).copy()
    test_actual = test_frame["_lead_time_days"].to_numpy(dtype=float)
    test_predicted = predictions["test_held_out"]
    test_frame["_target_range"] = pd.cut(test_actual, bins=TARGET_BINS, labels=TARGET_BIN_NAMES, right=False)
    test_frame["_created_year"] = test_frame["_created_at"].dt.year.astype(str)

    total_sse = float(np.square(test_predicted - test_actual).sum())
    total_sst = float(np.square(test_actual - test_actual.mean()).sum())
    report = {
        "diagnostic_version": 1,
        "model_version": MODEL_VERSION,
        "dataset_sha256": prepared.source_sha256,
        "artifact_sha256": manifest["artifact"]["sha256"],
        "target": manifest["target"],
        "feature_schema": FEATURE_SCHEMA,
        "split_counts": {name: int(len(frame)) for name, frame in split_frames.items()},
        "created_ranges": {
            name: [frame["_created_at"].min().isoformat(), frame["_created_at"].max().isoformat()]
            for name, frame in split_frames.items()
        },
        "target_distribution_by_split": split_targets,
        "metrics_by_split": split_metrics,
        "test_r2_decomposition": {
            "formula": "1 - SSE/SST",
            "sse": total_sse,
            "sst_about_test_mean": total_sst,
            "test_target_mean_days": float(test_actual.mean()),
            "test_target_std_days": float(test_actual.std(ddof=0)),
            "interpretation": "Large errors relative to the held-out test target's own variance can yield strongly negative R2 even when MAE beats a badly shifted median baseline.",
        },
        "test_subgroups": {
            "fixed_target_ranges_days": subgroup_metrics(test_frame, test_actual, test_predicted, "_target_range"),
            "created_year": subgroup_metrics(test_frame, test_actual, test_predicted, "_created_year"),
        },
        "text_feature_drift": title_lengths,
        "baseline_definition": {
            "train": "training-partition median/mean; in-sample diagnostic",
            "validation": "training-partition median/mean",
            "test": "train-plus-validation median/mean, matching final model fit set",
        },
        "metric_interpretation": {
            "train": "in-sample metrics from a model fitted on train; optimistic and not a generalization estimate",
            "validation": "alpha was selected on this validation partition; descriptive/model-selection metric, not unbiased",
            "test": "single final chronological held-out evaluation; no test-based tuning was performed",
        },
        "no_test_tuning": True,
        "limitations": manifest["limitations"],
    }
    _atomic_json(report_path.resolve(), report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument("--artifact-dir", type=Path, default=ROOT / "ml" / "models")
    parser.add_argument("--report", type=Path, default=ROOT / "ml" / "reports" / f"{MODEL_VERSION}-diagnostics.json")
    args = parser.parse_args()
    dataset_path = args.dataset
    if dataset_path is None:
        workbooks = [p for p in discover_dataset(ROOT) if p.suffix.lower() in {".xlsx", ".xls"}]
        if len(workbooks) != 1:
            parser.error(f"Expected exactly one root-level Excel dataset; discovered {len(workbooks)}")
        dataset_path = workbooks[0]
    report = analyze(dataset_path, args.artifact_dir, args.report)
    print(json.dumps({
        "report": str(args.report.resolve()),
        "split_counts": report["split_counts"],
        "target_distribution_by_split": report["target_distribution_by_split"],
        "metrics_by_split": report["metrics_by_split"],
        "test_r2_decomposition": report["test_r2_decomposition"],
        "test_subgroups": report["test_subgroups"],
        "text_feature_drift": report["text_feature_drift"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
