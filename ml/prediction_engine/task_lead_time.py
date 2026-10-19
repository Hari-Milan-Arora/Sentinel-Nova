"""Saved TF-IDF/Ridge predictor for Jira task elapsed completion lead time."""

from __future__ import annotations

from pathlib import Path
from typing import Any
import hashlib
import json
import math

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline


MODEL_VERSION = "task-lead-time-v1"
TARGET_NAME = "task_completion_lead_time"
TARGET_UNITS = "elapsed_calendar_days"
FEATURE_SCHEMA = ["Summary"]


def build_pipeline(alpha: float) -> TransformedTargetRegressor:
    features = ColumnTransformer(
        transformers=[
            (
                "summary_tfidf",
                TfidfVectorizer(
                    lowercase=True,
                    strip_accents="unicode",
                    ngram_range=(1, 2),
                    min_df=2,
                    max_df=0.98,
                    max_features=20000,
                    sublinear_tf=True,
                ),
                "Summary",
            )
        ],
        remainder="drop",
        verbose_feature_names_out=True,
    )
    regressor = Pipeline(
        steps=[
            ("features", features),
            ("ridge", Ridge(alpha=float(alpha), solver="lsqr")),
        ]
    )
    return TransformedTargetRegressor(
        regressor=regressor,
        func=np.log1p,
        inverse_func=np.expm1,
        check_inverse=False,
    )


def prediction_frame(summaries: list[str]) -> pd.DataFrame:
    if not isinstance(summaries, list) or not summaries or len(summaries) > 100:
        raise ValueError("summary_batch_must_contain_1_to_100_items")
    safe = []
    for summary in summaries:
        if not isinstance(summary, str) or not summary.strip() or len(summary) > 2000:
            raise ValueError("invalid_summary_feature")
        safe.append(summary.strip())
    return pd.DataFrame({"Summary": safe})


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_saved_model(artifact_dir: Path) -> tuple[Any, dict[str, Any]]:
    """Verify manifest and artifact hash before loading the local joblib file."""
    artifact_dir = artifact_dir.resolve()
    model_path = artifact_dir / f"{MODEL_VERSION}.joblib"
    manifest_path = artifact_dir / f"{MODEL_VERSION}.json"
    if not model_path.is_file() or not manifest_path.is_file():
        raise FileNotFoundError("trained_model_artifact_missing")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("trained_model_manifest_invalid") from exc
    if manifest.get("model_version") != MODEL_VERSION:
        raise ValueError("trained_model_version_incompatible")
    target = manifest.get("target", {})
    features = manifest.get("features", {})
    artifact = manifest.get("artifact", {})
    if target.get("name") != TARGET_NAME or target.get("units") != TARGET_UNITS:
        raise ValueError("trained_model_target_incompatible")
    if features.get("feature_schema") != FEATURE_SCHEMA:
        raise ValueError("trained_model_feature_schema_incompatible")
    if artifact.get("sha256") != _sha256(model_path):
        raise ValueError("trained_model_artifact_checksum_mismatch")
    try:
        model = joblib.load(model_path)
    except Exception as exc:  # joblib may raise multiple serialization errors
        raise ValueError("trained_model_artifact_corrupt") from exc
    if not isinstance(model, TransformedTargetRegressor) or not hasattr(model, "regressor_"):
        raise ValueError("trained_model_artifact_incompatible")
    return model, manifest


def predict_lead_time(model: Any, summaries: list[str]) -> list[float]:
    features = prediction_frame(summaries)
    predictions = np.asarray(model.predict(features), dtype=float).reshape(-1)
    if len(predictions) != len(summaries) or not np.isfinite(predictions).all():
        raise ValueError("trained_model_returned_invalid_prediction")
    # Lead time cannot be negative; this is a physical bound, not a fallback.
    return [float(max(0.0, value)) for value in predictions]


def model_provenance(manifest: dict[str, Any]) -> dict[str, Any]:
    metrics = manifest.get("training", {}).get("test_metrics", {}).get("trained_model", {})
    return {
        "source": "trained_model",
        "modelVersion": manifest["model_version"],
        "targetName": manifest["target"]["name"],
        "units": manifest["target"]["units"],
        "testMaeDays": _finite_metric(metrics.get("mae_days")),
        "testSampleCount": int(metrics.get("sample_count", 0)),
        "evaluationLimitations": manifest.get("limitations", []),
    }


def _finite_metric(value: Any) -> float | None:
    try:
        converted = float(value)
    except (TypeError, ValueError):
        return None
    return converted if math.isfinite(converted) else None
