"""Exercise SDK download recovery without invoking a native build."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import watch_voice_bazel


def sdk_failure(package="Microsoft.Windows.SDK.CPP.x64"):
    return (
        "Error in download_and_extract: java.io.IOException: Error downloading "
        f"[https://www.nuget.org/api/v2/package/{package}/10.0.26100.7705] "
        "to D:/o/sdk.nupkg: Premature EOF\n"
        "ERROR: Analysis of target '//third_party/voice:native_runtime_windows_aarch64' "
        "failed; build aborted: Analysis failed\n"
        "ERROR: Build did NOT complete successfully\n"
        "FAILED: \n"
        "ERROR: No test targets were found, yet testing was requested\n"
    )


class WatchVoiceBazelTests(unittest.TestCase):
    def run_sequence(self, results, enabled=True):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            child = root / "fake bazel.py"
            child.write_text(
                "import json, pathlib, sys\n"
                "counter = pathlib.Path(sys.argv[1])\n"
                "attempt = int(counter.read_text()) if counter.exists() else 0\n"
                "counter.write_text(str(attempt + 1))\n"
                "status, output = json.loads(sys.argv[2])[attempt]\n"
                "print(output, flush=True)\n"
                "sys.exit(status)\n"
            )
            counter = root / "attempts"
            launcher = (
                "import sys, watch_voice_bazel; "
                "watch_voice_bazel.SDK_DOWNLOAD_RETRY_DELAYS = (0, 0); "
                "sys.exit(watch_voice_bazel.main())"
            )
            result = subprocess.run(
                [
                    sys.executable, "-c", launcher,
                    sys.executable, str(child), str(counter), json.dumps(results),
                ],
                cwd=Path(__file__).parent,
                env={
                    **os.environ,
                    "VOICE_RETRY_SDK_DOWNLOADS": "1" if enabled else "0",
                    "BAZEL_OUTPUT_BASE": "",
                },
                capture_output=True,
                text=True,
                timeout=20,
            )
            return result, int(counter.read_text())

    def test_recovers_and_forwards_output(self):
        result, attempts = self.run_sequence([(1, sdk_failure()), (0, "built")])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(attempts, 2)
        self.assertIn("Premature EOF", result.stdout)
        self.assertIn("retry 1/2", result.stdout)
        self.assertIn("built", result.stdout)

    def test_stops_after_two_retries(self):
        result, attempts = self.run_sequence([(1, sdk_failure())] * 3)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(attempts, 3)

    def test_retry_state_does_not_leak_into_next_attempt(self):
        result, attempts = self.run_sequence(
            [(1, sdk_failure()), (1, "ERROR: Compiling helper failed")]
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(attempts, 2)

    def test_other_callers_remain_single_attempt(self):
        result, attempts = self.run_sequence([(1, sdk_failure())], enabled=False)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(attempts, 1)

    def test_non_download_failures_and_success_are_not_retried(self):
        cases = [
            (1, "ERROR: Compiling helper failed"),
            (1, sdk_failure().replace("Premature EOF", "Checksum mismatch")),
            (1, sdk_failure() + "ERROR: Compiling helper failed\n"),
            (1, sdk_failure() + "error[E0308]: mismatched types\n"),
            (1, sdk_failure() + "Error in download_and_extract: Checksum mismatch\n"),
            (3, sdk_failure()),
            (8, sdk_failure()),
            (0, sdk_failure()),
        ]
        for status, output in cases:
            with self.subTest(status=status, output=output):
                result, attempts = self.run_sequence([(status, output)])
                self.assertEqual(result.returncode, status, result.stderr)
                self.assertEqual(attempts, 1)

    def test_both_observed_packages_match(self):
        for package in ("Microsoft.Windows.SDK.CPP", "Microsoft.Windows.SDK.CPP.x64"):
            failure = watch_voice_bazel.SdkDownloadFailure()
            for line in sdk_failure(package).encode().splitlines():
                failure.observe(line)
            self.assertTrue(failure.truncated)
            self.assertFalse(failure.other_error)


if __name__ == "__main__":
    unittest.main()
