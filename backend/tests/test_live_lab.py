import unittest

from emulation.demo import parse_ping


class LiveLabTests(unittest.TestCase):
    def test_parse_ping_returns_loss_and_average_rtt(self):
        output = (
            "3 packets transmitted, 3 received, 0% packet loss, time 2002ms\n"
            "rtt min/avg/max/mdev = 0.043/0.081/0.122/0.031 ms\n"
        )
        self.assertEqual(parse_ping(output), (0.0, 0.081))

    def test_parse_ping_handles_failed_probe(self):
        output = "3 packets transmitted, 0 received, 100% packet loss, time 2045ms\n"
        self.assertEqual(parse_ping(output), (100.0, None))


if __name__ == "__main__":
    unittest.main()
