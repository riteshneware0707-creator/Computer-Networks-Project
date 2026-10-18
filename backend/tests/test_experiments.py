import unittest
from pathlib import Path

from fastapi import HTTPException

from backend.app.services.controller import analyze
from backend.app.services.experiments import get_experiment

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class ExperimentTests(unittest.TestCase):
    def test_existing_results_normalize_without_fabricating_missing_metrics(self):
        verified = get_experiment("verified")
        self.assertEqual(verified.metrics.transmitted_packets, 17578)
        self.assertEqual(verified.metrics.throughput_mbps, None)
        self.assertFalse(verified.routing.alternate_traffic_detected)
        self.assertFalse(verified.routing.forwarding_verified)
        self.assertIsNone(verified.routing.route_application_attempted)

    def test_failure_result_keeps_reported_measurement(self):
        failure = get_experiment("failure")
        self.assertEqual(failure.metrics.transmitted_packets, 10986)
        self.assertEqual(failure.metrics.average_delay_ms, 40.0699)
        self.assertIsNone(failure.routing.forwarding_verified)

    def test_controller_recommendation_is_not_forwarding_proof(self):
        result = analyze(get_experiment("verified"))
        self.assertEqual(result.selected_route, "alternate")
        self.assertFalse(result.route_application_attempted)
        self.assertFalse(result.forwarding_verified)
        self.assertIsNone(result.network_state_prediction)
        self.assertEqual(result.model_status, "incomplete_features")

    def test_live_ns3_record_verifies_alternate_forwarding(self):
        experiment = get_experiment("adaptive-validation-20261018")
        self.assertTrue(experiment.routing.route_application_attempted)
        self.assertTrue(experiment.routing.forwarding_verified)
        self.assertEqual(experiment.metrics.r1_r3_packets, 17096)
        self.assertEqual(experiment.metrics.r3_r4_packets, 17096)

    def test_trained_model_predicts_only_for_complete_feature_records(self):
        experiment = get_experiment("training-20261018T183638Z-normal-1")
        result = analyze(experiment)
        self.assertEqual(result.model_status, "ready")
        self.assertEqual(result.network_state_prediction, "normal")
        self.assertAlmostEqual(sum(result.class_probabilities.values()), 1.0)

    def test_experiment_identifier_rejects_traversal(self):
        with self.assertRaises(HTTPException) as context:
            get_experiment("..")
        self.assertEqual(context.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
