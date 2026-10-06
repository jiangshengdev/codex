"""Verify probe reporting without scanning the developer's machine."""

import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import macos_disk_probe


class MacosDiskProbeTests(unittest.TestCase):
    def test_reports_survive_command_failure_and_timeout(self):
        for failure in (
            subprocess.CompletedProcess([], 1, "partial topology", "inspection failed"),
            subprocess.TimeoutExpired(["diskutil", "apfs", "list"], 120),
            FileNotFoundError("diskutil unavailable"),
        ):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                environment = {
                    "HOME": temporary,
                    "RUNNER_TEMP": temporary,
                    "GITHUB_WORKSPACE": temporary,
                    "GITHUB_STEP_SUMMARY": str(root / "summary.md"),
                    "SCAN_DIRECTORIES": "false",
                }
                success = subprocess.CompletedProcess([], 0, "fixture output", "")
                with (
                    patch.dict(os.environ, environment, clear=True),
                    patch.object(macos_disk_probe.shutil, "which", return_value=None),
                    patch.object(
                        macos_disk_probe.subprocess, "run",
                        side_effect=[success] * 7 + [failure],
                    ) as run,
                    contextlib.redirect_stdout(io.StringIO()),
                ):
                    self.assertEqual(macos_disk_probe.main(), 1)
                report = json.loads((root / "macos-disk-probe/report.json").read_text())
                self.assertFalse(report["complete"])
                self.assertEqual(report["directories"], [])
                self.assertEqual(run.call_count, 8)
                markdown = (root / "macos-disk-probe/report.md").read_text()
                self.assertIn("Status: incomplete", markdown)
                self.assertEqual((root / "summary.md").read_text(), markdown)

    def test_directory_scan_keeps_partial_usage_and_absent_paths_distinct(self):
        environment = {
            "HOME": "/fixture/home",
            "RUNNER_TEMP": "/fixture/temp",
            "GITHUB_WORKSPACE": "/fixture/workspace",
            "SCAN_DIRECTORIES": "true",
        }

        def run(command, **kwargs):
            if command[0] == "du":
                self.assertEqual(command[1], "-skx")
                return subprocess.CompletedProcess(command, 1, "123\t/usr/local/share/dotnet", "denied")
            return subprocess.CompletedProcess(command, 0, "fixture output", "")

        with (
            patch.object(macos_disk_probe.shutil, "which", return_value=None),
            patch.object(Path, "glob", return_value=[]),
            patch.object(Path, "exists", autospec=True, side_effect=lambda p: str(p) == "/usr/local/share/dotnet"),
            patch.object(macos_disk_probe.subprocess, "run", side_effect=run),
        ):
            report = macos_disk_probe.collect(environment)
        self.assertFalse(report["complete"])
        records = {record["path"]: record for record in report["directories"]}
        self.assertEqual(records["/usr/local/share/dotnet"]["status"], "incomplete")
        self.assertIn("123", records["/usr/local/share/dotnet"]["stdout"])
        self.assertEqual(records["/fixture/home/.cargo"]["status"], "absent")

    def test_inventory_identifies_individual_apps_and_preserves_active_tool_evidence(self):
        environment = {
            "HOME": "/fixture/home",
            "RUNNER_TEMP": "/fixture/temp",
            "GITHUB_WORKSPACE": "/fixture/workspace",
            "SCAN_DIRECTORIES": "true",
            "DEVELOPER_DIR": "/Applications/Xcode.app/Contents/Developer",
        }
        application = Path("/Applications/Xcode.app")

        def run(command, **kwargs):
            output = "2048\t/Applications/Xcode.app" if command[0] == "du" else "active tool evidence"
            return subprocess.CompletedProcess(command, 0, output, "")

        with (
            patch.object(macos_disk_probe.shutil, "which", return_value=None),
            patch.object(Path, "glob", autospec=True, side_effect=lambda p, pattern: [application] if str(p) == "/Applications" else []),
            patch.object(Path, "exists", autospec=True, side_effect=lambda p: p == application),
            patch.object(macos_disk_probe.subprocess, "run", side_effect=run) as commands,
        ):
            report = macos_disk_probe.collect(environment)
        self.assertTrue(report["complete"])
        record = next(item for item in report["directories"] if item["path"] == str(application))
        self.assertEqual(record["allocated_kib"], 2048)
        self.assertIn("Keep selected Xcode", record["review"])
        self.assertEqual(report["developer_dir_override"], environment["DEVELOPER_DIR"])
        self.assertIn(
            ["xcrun", "--sdk", "macosx", "--show-sdk-path"],
            [call.args[0] for call in commands.call_args_list],
        )


if __name__ == "__main__":
    unittest.main()
