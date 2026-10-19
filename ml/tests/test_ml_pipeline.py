import unittest
from datetime import datetime, timezone

from ml.datasets.synthetic_generator import SyntheticDatasetGenerator
from ml.evaluation.evaluate import evaluate_performance
from ml.prediction_engine.feature_engineering import FeatureEngineer
from ml.prediction_engine.prediction_models import DeadlineRiskModel, TaskCompletionModel
from ml.prediction_engine.prediction_service import PredictionService


class HeuristicPipelineTests(unittest.TestCase):
    def test_task_completion_is_bounded_and_explicitly_heuristic(self):
        model = TaskCompletionModel()
        result = model.predict('urgent', float('nan'), 150, 0, 'unknown')
        self.assertEqual(result['probability'], 0.0)
        self.assertGreaterEqual(result['probability'], 0.0)
        self.assertLessEqual(result['probability'], 1.0)
        self.assertEqual(result['prediction_source'], 'deterministic_heuristic')
        self.assertNotIn('confidence', result)

    def test_invalid_and_missing_features_do_not_produce_non_finite_values(self):
        features = FeatureEngineer().build_inference_vector({
            'completed_tasks': None,
            'goals': [{'progress': 'bad'}, {}, None],
            'skill_history': [{'score': float('nan')}, {'score': 'bad'}],
            'work_hours': [None, 'bad', float('inf')],
            'completion_rates': [None, 2, -1, 'bad'],
        })
        for value in features.values():
            if value is not None:
                self.assertTrue(float('-inf') < float(value) < float('inf'))

    def test_velocity_requires_timestamped_completion_history(self):
        engineer = FeatureEngineer()
        self.assertIsNone(engineer.compute_task_velocity([]))
        self.assertIsNone(engineer.compute_task_velocity([{'status': 'completed'}]))
        now = datetime.now(timezone.utc).isoformat()
        self.assertAlmostEqual(engineer.compute_task_velocity([{'completedAt': now}]), 1 / 7)

    def test_overdue_task_is_always_critical(self):
        self.assertEqual(DeadlineRiskModel().predict(0.99, -1, 'low'), 'critical')

    def test_training_is_blocked_without_real_labeled_history(self):
        result = PredictionService().train_models([])
        self.assertEqual(result['status'], 'blocked_insufficient_validated_data')
        self.assertFalse(result['trained_model_available'])
        self.assertIsNone(result['metrics'])

    def test_inference_labels_heuristics_and_handles_malformed_context(self):
        result = PredictionService().generate_full_prediction_dashboard({
            'tasks': [None, {'id': 't1', 'daysRemaining': None, 'estimatedHours': 'bad'}],
            'goals': 'not-a-list',
            'skills': None,
        })
        self.assertEqual(result['predictionSource'], 'deterministic_heuristic')
        self.assertEqual(result['dataSufficiency'], 'insufficient_for_trained_prediction')
        self.assertEqual(len(result['tasks']), 1)
        self.assertEqual(result['tasks'][0]['predictionSource'], 'deterministic_heuristic')
        self.assertEqual(result['rankedRecommendations'], [])

    def test_unobserved_burnout_and_goal_success_are_unavailable(self):
        result = PredictionService().generate_full_prediction_dashboard({
            'goals': [{'id': 'g1', 'progress': 50, 'daysRemaining': 30}],
        })
        self.assertEqual(result['burnout']['burnoutRisk'], 'unknown')
        self.assertIsNone(result['burnout']['burnoutScore'])
        self.assertEqual(result['burnout']['productivityTrend'], [])
        self.assertIsNone(result['goals'][0]['successProbability'])

    def test_synthetic_generator_is_seed_reproducible_but_not_real_history(self):
        first = SyntheticDatasetGenerator(seed=101).generate_task_telemetry(12)
        second = SyntheticDatasetGenerator(seed=101).generate_task_telemetry(12)
        self.assertEqual(first, second)
        self.assertTrue(all('completedOnTime' in row for row in first))

    def test_evaluation_reports_synthetic_diagnostic_only(self):
        result = evaluate_performance()
        self.assertEqual(result['status'], 'synthetic_diagnostic_only')
        self.assertFalse(result['real_world_performance_estimated'])
        self.assertLessEqual(result['metrics']['accuracy'], 1.0)
        self.assertIn('not validation', result['warning'])


if __name__ == '__main__':
    unittest.main()
