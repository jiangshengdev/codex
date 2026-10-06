"""Inspect a macOS CI runner without building or changing its storage."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess


def capture(command):
    try:
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=120, check=False
        )
        return {
            "command": command,
            "status": "complete" if result.returncode == 0 else "incomplete",
            "exit_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"command": command, "status": "incomplete", "error": str(error)}


def collect(environ):
    home = Path(environ["HOME"])
    report = {
        "recorded_at_utc": datetime.now(timezone.utc).isoformat(),
        "image_os": environ.get("ImageOS"),
        "image_version": environ.get("ImageVersion"),
        "runner_arch": environ.get("RUNNER_ARCH"),
        "scan_directories": environ.get("SCAN_DIRECTORIES", "false") == "true",
        "tool_paths": {
            tool: shutil.which(tool)
            for tool in ("git", "python3", "rustc", "cargo", "clang", "xcrun", "brew", "cmake", "ninja")
        },
        "developer_dir_override": environ.get("DEVELOPER_DIR"),
        "commands": [],
        "directories": [],
    }
    # Record free space before directory scans and report writes.
    for command in (
        ["sw_vers"],
        ["uname", "-m"],
        ["df", "-k", str(home), environ["RUNNER_TEMP"], environ["GITHUB_WORKSPACE"]],
        ["diskutil", "list"],
        ["diskutil", "apfs", "list"],
        ["xcode-select", "-p"],
        ["xcrun", "--find", "clang"],
        ["xcrun", "--sdk", "macosx", "--show-sdk-path"],
    ):
        report["commands"].append(capture(command))
    if report["tool_paths"]["brew"]:
        report["commands"].append(capture([report["tool_paths"]["brew"], "list", "--versions"]))
    if report["scan_directories"]:
        candidates = {
            Path("/Library/Developer/CommandLineTools"): "Keep active compiler and macOS SDK dependencies",
            Path("/Library/Developer/CoreSimulator"): "Review simulator runtimes separately from the macOS SDK",
            home / "Library/Developer/CoreSimulator": "Review user simulator data",
            Path("/Library/Java/JavaVirtualMachines"): "Review Java toolchains",
            Path("/usr/local/share/dotnet"): "Review .NET toolchains",
            home / ".dotnet": "Review .NET toolchains",
            home / "Library/Android": "Review Android SDKs",
            home / ".android": "Review Android user data",
            home / ".ghcup": "Review Haskell toolchains",
            Path("/opt/ghc"): "Review Haskell toolchains",
            Path("/opt/homebrew/Cellar"): "Inspect individual formulas; do not remove Homebrew wholesale",
            Path("/usr/local/Cellar"): "Inspect individual formulas; do not remove Homebrew wholesale",
            home / ".cargo": "Keep Rust dependencies used by Cargo CI",
            home / ".rustup": "Keep the required Rust toolchain",
            home / ".cache/codex-ci": "Build data, not preinstalled software",
            Path(environ["RUNNER_TEMP"]): "Job data, not preinstalled software",
            Path(environ["GITHUB_WORKSPACE"]): "Keep the checkout",
        }
        for application in Path("/Applications").glob("*.app"):
            candidates[application] = (
                "Keep selected Xcode; review other versions only after checking compiler and SDK paths"
                if application.name.startswith("Xcode")
                else "Review application against archive job dependencies"
            )
        for cellar in (Path("/opt/homebrew/Cellar"), Path("/usr/local/Cellar")):
            for formula in cellar.glob("*"):
                candidates[formula] = "Review Homebrew formula and reverse dependencies before removal"
        if environ.get("RUNNER_TOOL_CACHE"):
            tool_cache = Path(environ["RUNNER_TOOL_CACHE"])
            candidates[tool_cache] = "Inspect cached toolchains; keep Python required by setup-cargo-voice"
            for tool in tool_cache.glob("*"):
                candidates[tool] = "Review cached toolchain against setup actions"
        for variable in ("ANDROID_HOME", "ANDROID_SDK_ROOT", "JAVA_HOME", "DOTNET_ROOT"):
            if environ.get(variable):
                candidates[Path(environ[variable])] = f"Review installed toolchain from {variable}"
        for path in sorted(candidates):
            if not path.exists():
                report["directories"].append({"path": str(path), "status": "absent", "review": candidates[path]})
                continue
            # BSD du defaults to not following symlinks; -x stays on one filesystem.
            record = capture(["du", "-skx", str(path)])
            record["path"] = str(path)
            record["resolved_path"] = str(path.resolve())
            record["review"] = candidates[path]
            if record["status"] == "complete":
                try:
                    record["allocated_kib"] = int(record["stdout"].split()[0])
                except (ValueError, IndexError):
                    record["status"] = "incomplete"
                    record["error"] = "Could not parse du size"
            report["directories"].append(record)
    report["complete"] = all(
        record["status"] != "incomplete"
        for record in report["commands"] + report["directories"]
    )
    return report


def main():
    report = collect(os.environ)
    output = Path(os.environ["RUNNER_TEMP"]) / "macos-disk-probe"
    output.mkdir(parents=True, exist_ok=True)
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    summary = [
        "# macOS preinstalled software inventory",
        "",
        f"Inspection complete: {report['complete']}",
        f"Image: {report['image_os']} / {report['image_version']}",
        f"Architecture: {report['runner_arch']}",
        "",
        "This independent probe does not build, restore caches, or measure peak build usage.",
        "df and du values are KiB. Directory rows overlap and must not be summed.",
        "APFS volumes can share container space; du usage is not guaranteed reclaimable space.",
        "Missing directories are reported as absent; failed or timed-out scans are incomplete.",
        "Review notes are candidate triage, not confirmation that a tool can safely be removed.",
        "Keep the active Xcode/macOS SDK, Rust toolchain, Python, Git, and their dependencies.",
        "",
    ]
    summary.extend(["## Removal candidate review (largest measured directories first)", "",
                    "| KiB | Path | Review |", "| ---: | --- | --- |"])
    for record in sorted(report["directories"], key=lambda item: item.get("allocated_kib", -1), reverse=True):
        size = record.get("allocated_kib", record["status"])
        summary.append(f"| {size} | {record['path']} | {record['review']} |")
    summary.extend(["", "## Active tool paths", "", "```json",
                    json.dumps(report["tool_paths"], indent=2), "```", "",
                    f"DEVELOPER_DIR override: {report['developer_dir_override']}", ""])
    for record in report["commands"] + report["directories"]:
        label = record.get("path") or " ".join(record["command"])
        summary.extend([f"## {label}", f"Status: {record['status']}", "", "```text"])
        summary.extend(
            record[key] for key in ("stdout", "stderr", "error") if record.get(key)
        )
        summary.extend(["```", ""])
    markdown = "\n".join(summary)
    (output / "report.md").write_text(markdown)
    with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as stream:
        stream.write(markdown)
    print(markdown)
    return 0 if report["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
