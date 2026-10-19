"""Tests for the real dataset pipeline; data-dependent cases skip without the local source file."""

from pathlib import Path
import json
import shutil
import tempfile
import unittest

import numpy as np

from ml.prediction_engine.task_lead_time import (
    FEATURE_SCHEMA,
    load_saved_model,
    predict_lead_time,
    prediction_frame,
)
from ml.training.dataset import chronological_split, discover_dataset, prepare_dataset


ROOT = Path(__file__).resolve().parents[2]
DATASET = ROOT / "Jira task dataset.xlsx"
ARTIFACTS = ROOT / "ml" / "models"


class DatasetPipelineTests(unittest.TestCase):
    @unittest.skipUnless(DATASET.is_file(), "user-provided root dataset is not in this checkout")
    def test_discovery_schema_target_and_exclusions_use_observed_dataset(self):
        discovered = discover_dataset(ROOT)
        self.assertIn(DATASET, discovered)
        prepared = prepare_dataset(DATASET)
        self.assertEqual(prepared.sheet_name, "100data")
        self.assertEqual(prepared.audit["source_rows"], 1193)
        self.assertEqual(prepared.audit["duplicate_full_rows_removed"], 0)
        self.assertEqual(prepared.audit["rows_with_missing_created_timestamp"], 0)
        self.assertEqual(prepared.audit["rows_with_missing_resolved_timestamp"], 0)
        self.assertEqual(prepared.audit["rows_with_nonpositive_lead_time"], 0)
        self.assertEqual(prepared.audit["duplicate_title_rows_excluded"], 6)
        self.assertEqual(prepared.audit["usable_rows"], 1187)
        self.assertTrue(np.isfinite(prepared.rows["_lead_time_days"]).all())
        self.assertTrue((prepared.rows["_lead_time_days"] > 0).all())
        self.assertEqual(FEATURE_SCHEMA, ["Summary"])

    @unittest.skipUnless(DATASET.is_file(), "user-provided root dataset is not in this checkout")
    def test_chronological_split_is_reproducible_and_titles_do_not_overlap(self):
        rows = prepare_dataset(DATASET).rows
        split_a = chronological_split(rows)
        split_b = chronological_split(rows)
        self.assertEqual([len(part) for part in split_a], [830, 178, 179])
        self.assertEqual(
            [[*part["Summary"]] for part in split_a],
            [[*part["Summary"]] for part in split_b],
        )
        for left, right in zip(split_a, split_a[1:]):
            self.assertLess(left["_created_at"].max(), right["_created_at"].min())
            self.assertTrue(set(left["_summary_key"]).isdisjoint(set(right["_summary_key"])))

    def test_prediction_feature_validation_is_bounded(self):
        with self.assertRaisesRegex(ValueError, "invalid_summary_feature"):
            prediction_frame([""])
        with self.assertRaisesRegex(ValueError, "invalid_summary_feature"):
            prediction_frame(["x" * 2001])
        with self.assertRaisesRegex(ValueError, "summary_batch"):
            prediction_frame(["summary"] * 101)

    def test_missing_and_corrupt_artifacts_fail_closed(self):
        with self.assertRaisesRegex(FileNotFoundError, "trained_model_artifact_missing"):
            load_saved_model(ROOT / "ml" / "missing-artifacts")
        if (ARTIFACTS / "task-lead-time-v1.joblib").is_file():
            with tempfile.TemporaryDirectory() as directory:
                temp = Path(directory)
                shutil.copy2(ARTIFACTS / "task-lead-time-v1.json", temp / "task-lead-time-v1.json")
                (temp / "task-lead-time-v1.joblib").write_bytes(b"corrupt artifact bytes")
                with self.assertRaisesRegex(ValueError, "trained_model_artifact_checksum_mismatch"):
                    load_saved_model(temp)

    def test_incompatible_manifest_fails_before_artifact_deserialization(self):
        if not (ARTIFACTS / "task-lead-time-v1.json").is_file():
            self.skipTest("trained model manifest is not present")
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            shutil.copy2(ARTIFACTS / "task-lead-time-v1.joblib", temp / "task-lead-time-v1.joblib")
            manifest = json.loads((ARTIFACTS / "task-lead-time-v1.json").read_text(encoding="utf-8"))
            manifest["features"]["feature_schema"] = ["Description"]
            (temp / "task-lead-time-v1.json").write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "trained_model_feature_schema_incompatible"):
                load_saved_model(temp)

    @unittest.skipUnless(DATASET.is_file() and (ARTIFACTS / "task-lead-time-v1.joblib").is_file(), "real dataset/artifact not present")
    def test_saved_artifact_predicts_real_held_out_record_with_provenance(self):
        rows = prepare_dataset(DATASET).rows
        _, _, test = chronological_split(rows)
        model, manifest = load_saved_model(ARTIFACTS)
        values = predict_lead_time(model, [str(test.iloc[0]["Summary"])])
        self.assertEqual(len(values), 1)
        self.assertTrue(np.isfinite(values[0]))
        self.assertGreaterEqual(values[0], 0)
        self.assertEqual(manifest["target"]["units"], "elapsed_calendar_days")
        self.assertEqual(manifest["training"]["test_metrics"]["trained_model"]["sample_count"], 179)


if __name__ == "__main__":
    unittest.main()
