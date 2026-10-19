"""Long-lived JSON-lines inference worker for the Sentinel Nova Node server."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.prediction_engine.task_lead_time import (
    MODEL_VERSION,
    load_saved_model,
    model_provenance,
    predict_lead_time,
)


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":"), allow_nan=False) + "\n")
    sys.stdout.flush()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-dir", type=Path, required=True)
    args = parser.parse_args()

    model = None
    manifest = None
    try:
        model, manifest = load_saved_model(args.artifact_dir)
        emit({"type": "ready", "ok": True, "modelVersion": manifest["model_version"]})
    except Exception:
        emit({"type": "ready", "ok": False, "failureCategory": "model_unavailable"})

    for raw_line in sys.stdin:
        request_id = "invalid"
        try:
            request = json.loads(raw_line)
            request_id = request.get("requestId") if isinstance(request, dict) else None
            if not isinstance(request_id, str) or len(request_id) > 80:
                emit({"requestId": "invalid", "ok": False, "failureCategory": "invalid_request"})
                continue
            if model is None or manifest is None:
                emit({"requestId": request_id, "ok": False, "failureCategory": "model_unavailable"})
                continue
            features = request.get("features")
            if not isinstance(features, list) or not 1 <= len(features) <= 100:
                emit({"requestId": request_id, "ok": False, "failureCategory": "invalid_request"})
                continue
            summaries = []
            for feature in features:
                if not isinstance(feature, dict) or set(feature) != {"summary"}:
                    raise ValueError("invalid_feature_schema")
                summaries.append(feature["summary"])
            values = predict_lead_time(model, summaries)
            emit({
                "requestId": request_id,
                "ok": True,
                "predictions": [{"index": index, "leadTimeDays": value} for index, value in enumerate(values)],
                "provenance": model_provenance(manifest),
            })
        except ValueError:
            emit({"requestId": request_id if isinstance(request_id, str) else "invalid", "ok": False, "failureCategory": "invalid_features"})
        except Exception:
            emit({"requestId": request_id if isinstance(request_id, str) else "invalid", "ok": False, "failureCategory": "prediction_failed"})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
