"""Capture one bounded diagnostic when the ARM64 voice build goes silent."""

import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import time


SDK_DOWNLOAD_RETRY_DELAYS = (30, 60)


class SdkDownloadFailure:
    """Retry only the observed SDK EOF failure and its analysis fallout."""

    def __init__(self):
        self.truncated = False
        self.other_error = False

    def observe(self, line):
        text = line.decode(errors="replace").strip()
        sdk_eof = (
            "Error downloading [https://www.nuget.org/api/v2/package/Microsoft.Windows.SDK.CPP"
            in text
            and text.endswith(": Premature EOF")
        )
        if text.startswith("Error in download_and_extract:") and sdk_eof:
            self.truncated = True
        if re.match(
            r"(?:ERROR:|Error in download_and_extract:|error(?:\[|:)|FAIL:|FAILED: .+)",
            text,
        ):
            fallout = (
                sdk_eof
                or (
                    "windows_sdk.bzl:" in text
                    and "An error occurred during the fetch of repository 'windows_support++windows_sdk+windows_sdk':"
                    in text
                )
                or re.fullmatch(
                    r"ERROR: Analysis of target '//third_party/voice:native_runtime_windows_(?:aarch64|x86_64)' failed; build aborted: Analysis failed",
                    text,
                )
                or text
                in (
                    "ERROR: Build did NOT complete successfully",
                    "ERROR: No test targets were found, yet testing was requested",
                )
            )
            if not fallout:
                self.other_error = True


def diagnose():
    root = Path(os.environ.get("BAZEL_OUTPUT_BASE", ""))
    if not root.is_absolute():
        print("Bazel output base unavailable; skipping diagnostics", flush=True)
        return
    for relative in ("command.log", "server/jvm.out"):
        try:
            with (root / relative).open("rb") as source:
                source.seek(max(0, source.seek(0, 2) - 16384))
                print(
                    f"Bazel {relative} tail:\n{source.read(16384).decode(errors='replace')}",
                    flush=True,
                )
        except OSError as error:
            print(f"Cannot read {relative}: {error}", flush=True)
    try:
        pid = str(int((root / "server/server.pid.txt").read_text().strip()))
        jstack = shutil.which("jstack")
        if not jstack:
            print("jstack unavailable; log tails retained", flush=True)
            return
        result = subprocess.run([jstack, pid], capture_output=True, timeout=20)
        print(
            f"jstack exit {result.returncode}:\n{(result.stdout + result.stderr)[-65536:].decode(errors='replace')}",
            flush=True,
        )
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(f"Cannot capture JVM stacks: {error}", flush=True)


def main(attempt=0):
    failure = SdkDownloadFailure()
    with subprocess.Popen(
        sys.argv[1:], stdout=subprocess.PIPE, stderr=subprocess.STDOUT
    ) as process:
        last_output = time.monotonic()

        def forward():
            nonlocal last_output
            for line in process.stdout:
                last_output = time.monotonic()
                failure.observe(line)
                sys.stdout.buffer.write(line)
                sys.stdout.buffer.flush()

        reader = threading.Thread(target=forward)
        reader.start()
        captured = False
        while process.poll() is None:
            if (
                not captured
                and os.environ.get("VOICE_ARCH") == "aarch64"
                and time.monotonic() - last_output >= 600
            ):
                captured = True
                print(
                    "ARM64 Bazel silent for ten minutes; capturing diagnostics",
                    flush=True,
                )
                diagnose()
            time.sleep(1)
        reader.join()
        if process.returncode and not captured:
            print("Bazel command failed; capturing diagnostics", flush=True)
            diagnose()
        if (
            process.returncode == 1
            and os.environ.get("VOICE_RETRY_SDK_DOWNLOADS") == "1"
            and failure.truncated
            and not failure.other_error
            and attempt < len(SDK_DOWNLOAD_RETRY_DELAYS)
        ):
            delay = SDK_DOWNLOAD_RETRY_DELAYS[attempt]
            print(
                f"Windows SDK download truncated; retrying Bazel in {delay} seconds "
                f"(retry {attempt + 1}/{len(SDK_DOWNLOAD_RETRY_DELAYS)})",
                flush=True,
            )
            time.sleep(delay)
            return main(attempt + 1)
        return process.returncode


if __name__ == "__main__":
    sys.exit(main())
