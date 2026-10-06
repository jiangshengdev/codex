"""Bridge release native inputs to Cargo without changing workspace coverage."""

import argparse
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys

VOICE = Path(__file__).resolve().parents[2] / "third_party/voice"
sys.path.insert(0, str(VOICE))
from package_runtime import runtime_files
from runtime import digest
from sdk import MODULES


def validate(root, target, commit):
    sdk = root / "sdk"
    receipt = json.loads((sdk / "sdk.json").read_text())
    if (
        receipt.get("schemaVersion") != 1
        or receipt.get("target") != target
        or receipt.get("sourceCommit") != commit
        or receipt.get("sourceManifestSha256") != digest(VOICE / "sources.json")
    ):
        raise ValueError("voice SDK does not match this commit, target and sources")
    for record in receipt["files"]:
        path = sdk / record["path"]
        if (
            not path.resolve(strict=True).is_relative_to(sdk)
            or digest(path) != record["sha256"]
        ):
            raise ValueError("voice SDK file digest mismatch")
    for module in MODULES:
        if not (sdk / "lib/pkgconfig" / f"{module}.pc").is_file():
            raise ValueError(f"voice SDK is missing {module}")
    runtime_files(root / "runtime", target)
    runtime = json.loads((root / "runtime/runtime.json").read_text())
    if runtime["sourceCommit"] != commit:
        raise ValueError("voice runtime does not match this commit")


def pkg_config_command(config, args, inherited):
    # Other workspace crates still need system metadata, notably Linux ALSA.
    media = any(
        re.match(rf"^{re.escape(module)}(?:$|\s|[<>=])", argument)
        for module in MODULES
        for argument in args
    )
    env = inherited.copy()
    if media:
        env.update(PKG_CONFIG_LIBDIR=config["pc_dir"], PKG_CONFIG_PATH="")
        env.pop("PKG_CONFIG_SYSROOT_DIR", None)
        return [config["pkg_config"], "--define-prefix", *args], env
    return [config["system_pkg_config"] or config["pkg_config"], *args], env


def cargo_environment(root, target, wrapper, inherited):
    runtime = root / "runtime"
    env = {
        "CODEX_TEST_VOICE_RUNTIME": str(runtime),
        f"PKG_CONFIG_{target.replace('-', '_')}": str(wrapper),
    }
    for module in MODULES:
        key = re.sub(r"[^A-Za-z0-9]", "_", module).upper()
        env[f"SYSTEM_DEPS_{key}_SEARCH_NATIVE"] = str(runtime / "lib")
        if module.startswith("gstreamer-"):
            # Remove SDK build-machine rpaths, as the Bazel consumer does.
            env[f"SYSTEM_DEPS_{key}_LDFLAGS"] = ""
    if not target.endswith("windows-msvc"):
        # A sys crate's rustc-link-arg does not propagate through its rlib.
        # Apply this to final Cargo links so installed helpers find adjacent lib/.
        rpath = (
            "@loader_path/../lib"
            if target.endswith("apple-darwin")
            else "$ORIGIN/../lib"
        )
        if "CARGO_ENCODED_RUSTFLAGS" in inherited:
            key, separator = "CARGO_ENCODED_RUSTFLAGS", "\x1f"
        elif "RUSTFLAGS" in inherited:
            key, separator = "RUSTFLAGS", " "
        else:
            key, separator = (
                f"CARGO_TARGET_{target.replace('-', '_').upper()}_RUSTFLAGS",
                " ",
            )
        flags = separator.join(["-C", f"link-arg=-Wl,-rpath,{rpath}"])
        env[key] = inherited[key] + separator + flags if inherited.get(key) else flags
    return env


def configure(root, target, commit):
    if not re.fullmatch(
        r"(?:aarch64|x86_64)-(?:apple-darwin|unknown-linux-gnu|pc-windows-msvc)", target
    ):
        raise ValueError("unsupported voice target")
    validate(root, target, commit)
    windows = target.endswith("windows-msvc")
    tool = root / "tools" / ("pkgconf.exe" if windows else "pkg-config")
    if not tool.is_file():
        raise ValueError("voice pkg-config executable is missing")
    config = root / "pkg-config.json"
    config.write_text(
        json.dumps(
            {
                "pkg_config": str(tool),
                "system_pkg_config": shutil.which("pkg-config"),
                "pc_dir": str(root / "sdk/lib/pkgconfig"),
            }
        )
    )
    # Invalidate cached Cargo build-script probes when the native inputs change.
    wrapper = root / (f"pkg-config-{commit}" + (".cmd" if windows else ""))
    command = [sys.executable, str(Path(__file__).resolve()), "pkg-config", str(config)]
    if windows:
        wrapper.write_text("@echo off\n" + subprocess.list2cmdline(command) + " %*\n")
    else:
        wrapper.write_text("#!/bin/sh\nexec " + shlex.join(command) + ' "$@"\n')
        wrapper.chmod(0o755)
    env = cargo_environment(root, target, wrapper, os.environ)
    with Path(os.environ["GITHUB_ENV"]).open("a", encoding="utf-8") as output:
        for key, value in env.items():
            if "\n" in value or "\r" in value:
                raise ValueError("invalid environment value")
            output.write(f"{key}={value}\n")


def runtime_environment(runtime, inherited, platform):
    env = inherited.copy()
    if platform == "win32":
        key, directory, separator = "PATH", runtime / "bin", ";"
    else:
        key = "DYLD_LIBRARY_PATH" if platform == "darwin" else "LD_LIBRARY_PATH"
        directory, separator = runtime / "lib", ":"
    env[key] = str(directory) + (separator + env[key] if env.get(key) else "")
    return env


def main():
    mode, *args = sys.argv[1:]
    if mode == "pkg-config":
        config = json.loads(Path(args[0]).read_text())
        command, env = pkg_config_command(config, args[1:], os.environ)
    elif mode == "run":
        if not args or args.pop(0) != "--" or not args:
            raise ValueError("run requires -- followed by a command")
        # Keep Cargo, metadata discovery and Git in the host loader environment.
        # A TOML array preserves runner arguments even when paths contain spaces.
        target = os.environ["CODEX_CI_TARGET"]
        runner = [sys.executable, str(Path(__file__).resolve()), "test-runner"]
        if sys.platform == "win32":
            # Avoid backslash escapes in TOML passed through Windows launchers.
            runner = [argument.replace("\\", "/") for argument in runner]
        command = [*args, "--config", f"target.{target}.runner={json.dumps(runner)}"]
        env = os.environ.copy()
    elif mode == "test-runner":
        command = args
        env = os.environ.copy()
        # Cargo's hashed executable names are available during both nextest
        # discovery and execution. These integration binaries belong to voice-host.
        if re.fullmatch(
            r"(?:codex_voice_host|installed_client|packaged_runtime)-[0-9a-f]+(?:\.exe)?",
            Path(command[0]).name,
        ):
            # Set this after starting the runner shell: macOS SIP can remove
            # DYLD_* variables when launching system shells.
            env = runtime_environment(
                Path(os.environ["CODEX_TEST_VOICE_RUNTIME"]), env, sys.platform
            )
    elif mode == "configure":
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("--root", required=True, type=Path)
        parser.add_argument("--target", required=True)
        parser.add_argument("--commit", required=True)
        options = parser.parse_args(args)
        configure(options.root.resolve(strict=True), options.target, options.commit)
        return 0
    else:
        raise ValueError(f"unknown mode: {mode}")
    return subprocess.run(command, env=env).returncode


if __name__ == "__main__":
    sys.exit(main())
