import asyncio
import unittest
from unittest.mock import patch

import httpx

from backend.app.main import app


class ApiTests(unittest.TestCase):
    def request(self, method, path, **kwargs):
        async def send():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                return await client.request(method, path, **kwargs)

        return asyncio.run(send())

    def test_health_and_topology(self):
        health = self.request("GET", "/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["status"], "ok")
        topology = self.request("GET", "/api/topology")
        self.assertEqual(topology.status_code, 200)
        self.assertEqual(len(topology.json()["nodes"]), 6)
        self.assertEqual(len(topology.json()["links"]), 6)

    def test_experiment_data_keeps_unverified_switch_unverified(self):
        response = self.request("GET", "/api/experiments/verified")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["routing"]["forwarding_verified"])
        self.assertIsNone(body["routing"]["route_application_attempted"])

    def test_analysis_recommends_without_claiming_application(self):
        response = self.request("POST", "/api/controller/analyze", json={"experiment_id": "verified"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["selected_route"], "alternate")
        self.assertFalse(body["route_application_attempted"])
        self.assertFalse(body["forwarding_verified"])
        self.assertIsNone(body["network_state_prediction"])

    def test_analysis_serves_model_prediction_and_probabilities(self):
        response = self.request(
            "POST",
            "/api/controller/analyze",
            json={"experiment_id": "training-20261018T183638Z-normal-1"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["model_status"], "ready")
        self.assertEqual(body["network_state_prediction"], "normal")
        self.assertAlmostEqual(sum(body["class_probabilities"].values()), 1.0)

    def test_recorded_events_include_missing_forwarding_evidence(self):
        response = self.request("GET", "/api/events")
        self.assertEqual(response.status_code, 200)
        events = response.json()["events"]
        self.assertTrue(
            any(
                event["experiment_id"] == "verified"
                and event["kind"] == "alternate_forwarding_not_verified"
                for event in events
            )
        )

    def test_unknown_experiment_is_not_hidden_as_empty_data(self):
        response = self.request("GET", "/api/experiments/does-not-exist")
        self.assertEqual(response.status_code, 404)

    def test_frontend_cors_origin_is_allowed(self):
        response = self.request(
            "OPTIONS",
            "/api/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:3000")

    def test_live_status_and_action_use_live_lab_service(self):
        live_status = {
            "available": True,
            "running": True,
            "network_state": "normal",
            "selected_route": "primary",
            "primary_link_delay_ms": 1.2,
            "packet_loss_pct": 0,
            "average_delay_ms": 1.2,
            "throughput_mbps": 8.0,
            "primary_tx_packets": 20,
            "alternate_tx_packets": 0,
            "forwarding_verified": True,
            "event": None,
        }
        with patch("backend.app.main.run_live_action", return_value=live_status) as action:
            response = self.request("GET", "/api/live/status")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["selected_route"], "primary")
            action.assert_called_once_with("status")

        with patch("backend.app.main.run_live_action", return_value=live_status) as action:
            response = self.request("POST", "/api/live/action", json={"action": "congestion"})
            self.assertEqual(response.status_code, 200)
            action.assert_called_once_with("congestion")

    def test_live_api_rejects_unknown_action(self):
        response = self.request("POST", "/api/live/action", json={"action": "shell"})
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
