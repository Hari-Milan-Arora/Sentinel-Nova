"""Regression checks for the saved real-data model diagnosis."""

from pathlib import Path
import tempfile
import unittest

from ml.evaluation.diagnose_task_lead_time import analyze


ROOT = Path(__file__).resolve().parents[2]
DATASET = ROOT / "Jira task dataset.xlsx"
ARTIFACTS = ROOT / "ml" / "models"


@unittest.skipUnless(DATASET.is_file() and (ARTIFACTS / "task-lead-time-v1.joblib").is_file(), "real workbook/artifact not present")
class SavedLeadTimeDiagnosisTests(unittest.TestCase):
    def test_saved_artifact_is_reproduced_without_test_tuning(self):
        with tempfile.TemporaryDirectory() as directory:
            report = analyze(DATASET, ARTIFACTS, Path(directory) / "diagnostics.json")

        self.assertEqual(report["split_counts"], {"train": 830, "validation": 178, "test": 179})
        self.assertTrue(report["no_test_tuning"])
        test = report["metrics_by_split"]["test"]
        self.assertAlmostEqual(test["trained_model"]["mae_days"], 281.7987267, places=5)
        self.assertAlmostEqual(test["trained_model"]["r2"], -497.7119203, places=5)
        self.assertAlmostEqual(test["median_baseline"]["mae_days"], 620.9803073, places=5)
        self.assertAlmostEqual(test["mean_baseline"]["mae_days"], 591.5533149, places=5)
        self.assertLess(test["trained_model"]["r2"], 0)
        self.assertGreater(test["trained_model"]["prediction_mean_days"], 250)
        self.assertLess(test["trained_model"]["actual_mean_days"], 20)


if __name__ == "__main__":
    unittest.main()
