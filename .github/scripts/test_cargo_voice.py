"""Exercise Cargo's release-SDK bridge without compiling native dependencies."""

import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import tomllib
import unittest
from unittest.mock import patch

import cargo_voice


class CargoVoiceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="cargo voice ")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.pc = self.root / "sdk/lib/pkgconfig"
        self.pc.mkdir(parents=True)

    def metadata(self, root, name, version):
        path = root / f"{name}.pc"
        path.write_text(
            "prefix=${pcfiledir}/../..\n"
            "libdir=${prefix}/lib\n"
            f"Name: {name}\nDescription: fixture\nVersion: {version}\n"
            "Libs: -L${prefix}/lib -lfixture\n"
        )
        return path

    def test_moved_sdk_is_isolated_while_system_dependencies_remain_available(self):
        tool = shutil.which("pkg-config")
        if not tool:
            self.skipTest("requires an existing pkg-config executable")
        self.metadata(self.pc, "gstreamer-1.0", "1.28.6")
        system = self.root / "system"
        system.mkdir()
        self.metadata(system, "gstreamer-1.0", "99.0")
        self.metadata(system, "alsa", "1.2.9")
        moved = self.root / "moved sdk"
        (self.root / "sdk").rename(moved)
        config = {
            "pkg_config": tool,
            "system_pkg_config": tool,
            "pc_dir": str(moved / "lib/pkgconfig"),
        }
        inherited = {**os.environ, "PKG_CONFIG_PATH": str(system)}

        def probe(*args):
            command, env = cargo_voice.pkg_config_command(config, args, inherited)
            return subprocess.run(command, env=env, capture_output=True, text=True)

        self.assertEqual(
            probe("--modversion", "gstreamer-1.0").stdout.strip(), "1.28.6"
        )
        self.assertEqual(probe("--modversion", "alsa").stdout.strip(), "1.2.9")
        self.assertNotEqual(
            probe("--atleast-version=2.0", "gstreamer-1.0").returncode, 0
        )
        self.assertEqual(
            Path(
                shlex.split(probe("--variable=libdir", "gstreamer-1.0").stdout)[0]
            ).resolve(),
            moved / "lib",
        )
        (moved / "lib/pkgconfig/gstreamer-1.0.pc").unlink()
        self.assertNotEqual(probe("--exists", "gstreamer-1.0").returncode, 0)

    def test_sdk_commit_and_byte_mismatches_fail_before_activation(self):
        file = self.metadata(self.pc, "glib-2.0", "2.88.3")
        receipt = {
            "schemaVersion": 1,
            "target": "aarch64-apple-darwin",
            "sourceCommit": "a" * 40,
            "sourceManifestSha256": cargo_voice.digest(
                cargo_voice.VOICE / "sources.json"
            ),
            "files": [
                {
                    "path": "lib/pkgconfig/glib-2.0.pc",
                    "sha256": cargo_voice.digest(file),
                }
            ],
        }
        (self.root / "sdk/sdk.json").write_text(json.dumps(receipt))
        with self.assertRaisesRegex(ValueError, "does not match"):
            cargo_voice.validate(self.root, receipt["target"], "b" * 40)
        file.write_text("tampered")
        with self.assertRaisesRegex(ValueError, "digest mismatch"):
            cargo_voice.validate(self.root, receipt["target"], "a" * 40)

    def test_configured_wrapper_preserves_arguments_and_media_version_checks(self):
        if sys.platform == "win32":
            self.skipTest(
                "Unix launcher probe; Windows requires the native pkgconf artifact"
            )
        tool = shutil.which("pkg-config")
        if not tool:
            self.skipTest("requires an existing pkg-config executable")
        self.metadata(self.pc, "glib-2.0", "2.88.3")
        (self.root / "tools").mkdir()
        shutil.copy2(tool, self.root / "tools/pkg-config")
        environment_file = self.root / "github-env"
        target = "aarch64-apple-darwin"
        with (
            patch.object(cargo_voice, "validate"),
            patch.dict(os.environ, GITHUB_ENV=str(environment_file)),
        ):
            cargo_voice.configure(self.root, target, "a" * 40)
        env = dict(
            line.split("=", 1) for line in environment_file.read_text().splitlines()
        )
        wrapper = env["PKG_CONFIG_aarch64_apple_darwin"]
        result = subprocess.run(
            [wrapper, "--modversion", "glib-2.0"], capture_output=True, text=True
        )
        self.assertEqual((result.returncode, result.stdout.strip()), (0, "2.88.3"))
        self.assertEqual(
            env["SYSTEM_DEPS_GSTREAMER_1_0_SEARCH_NATIVE"],
            str(self.root / "runtime/lib"),
        )
        self.assertEqual(env["SYSTEM_DEPS_GSTREAMER_1_0_LDFLAGS"], "")

    def test_final_link_flags_preserve_existing_cargo_flag_precedence(self):
        for target, key, existing, separator in (
            (
                "aarch64-apple-darwin",
                "CARGO_ENCODED_RUSTFLAGS",
                "--cfg\x1ffixture",
                "\x1f",
            ),
            ("x86_64-unknown-linux-gnu", "RUSTFLAGS", "--cfg fixture", " "),
            (
                "aarch64-unknown-linux-gnu",
                "CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_RUSTFLAGS",
                "--cfg fixture",
                " ",
            ),
        ):
            with self.subTest(target=target, key=key):
                env = cargo_voice.cargo_environment(
                    self.root, target, self.root / "wrapper", {key: existing}
                )
                rpath = (
                    "@loader_path/../lib"
                    if target.endswith("darwin")
                    else "$ORIGIN/../lib"
                )
                self.assertEqual(
                    env[key].split(separator),
                    ["--cfg", "fixture", "-C", f"link-arg=-Wl,-rpath,{rpath}"],
                )
        env = cargo_voice.cargo_environment(
            self.root, "aarch64-pc-windows-msvc", self.root / "wrapper.cmd", {}
        )
        self.assertFalse(any("RUSTFLAGS" in key for key in env))

    def test_nextest_and_host_children_do_not_inherit_voice_loader_path(self):
        runtime = self.root / "relocated runtime"
        with (
            patch.dict(
                os.environ,
                CODEX_TEST_VOICE_RUNTIME=str(runtime),
                CODEX_CI_TARGET="aarch64-apple-darwin",
            ),
            patch.object(
                sys, "argv", ["cargo_voice.py", "run", "--", "cargo", "nextest", "run"]
            ),
            patch.object(cargo_voice.subprocess, "run") as run,
        ):
            cargo_voice.main()
        command = run.call_args.args[0]
        env = run.call_args.kwargs["env"]
        for variable in ("DYLD_LIBRARY_PATH", "LD_LIBRARY_PATH", "PATH"):
            self.assertNotIn(str(runtime), env.get(variable, ""))
        config = tomllib.loads(command[command.index("--config") + 1])
        runner = config["target"]["aarch64-apple-darwin"]["runner"]
        probe = "import os; print(os.environ.get('DYLD_LIBRARY_PATH', ''))"
        result = subprocess.run(
            [*runner, sys.executable, "-c", probe],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(str(runtime / "lib"), result.stdout)

    def test_runner_limits_loader_environment_to_voice_binaries(self):
        for platform, variable, directory, separator in (
            ("darwin", "DYLD_LIBRARY_PATH", "lib", ":"),
            ("linux", "LD_LIBRARY_PATH", "lib", ":"),
            ("win32", "PATH", "bin", ";"),
        ):
            for binary, voice in (
                ("codex_voice_host-0123456789abcdef", True),
                ("installed_client-0123456789abcdef", True),
                ("packaged_runtime-0123456789abcdef", True),
                ("codex_core-0123456789abcdef", False),
                ("codex_voice_host_extra-0123456789abcdef", False),
            ):
                with self.subTest(platform=platform, binary=binary):
                    runtime = self.root / "relocated runtime"
                    executable = binary + (".exe" if platform == "win32" else "")
                    inherited = {
                        "CODEX_TEST_VOICE_RUNTIME": str(runtime),
                        variable: "existing",
                    }
                    with (
                        patch.dict(os.environ, inherited, clear=True),
                        patch.object(sys, "platform", platform),
                        patch.object(
                            sys,
                            "argv",
                            ["cargo_voice.py", "test-runner", executable, "--list"],
                        ),
                        patch.object(cargo_voice.subprocess, "run") as run,
                    ):
                        run.return_value.returncode = 17
                        self.assertEqual(cargo_voice.main(), 17)
                    expected = inherited.copy()
                    if voice:
                        expected[variable] = (
                            str(runtime / directory) + separator + "existing"
                        )
                    run.assert_called_once_with([executable, "--list"], env=expected)

    @unittest.skipIf(sys.platform == "win32", "executable symlink probe requires Unix")
    def test_test_runner_sets_loader_environment_at_relocated_shard_path(self):
        runtime = self.root / "relocated runtime"
        variable = (
            "DYLD_LIBRARY_PATH" if sys.platform == "darwin" else "LD_LIBRARY_PATH"
        )
        if sys.platform == "win32":
            variable = "PATH"
        executable = self.root / (
            "codex_voice_host-0123456789abcdef"
            + (".exe" if sys.platform == "win32" else "")
        )
        executable.symlink_to(sys.executable)
        result = subprocess.run(
            [
                sys.executable,
                str(Path(cargo_voice.__file__)),
                "test-runner",
                str(executable),
                "-c",
                f"import os; print(os.environ[{variable!r}])",
            ],
            env={**os.environ, "CODEX_TEST_VOICE_RUNTIME": str(runtime)},
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(
            result.stdout.startswith(
                str(runtime / ("bin" if sys.platform == "win32" else "lib"))
            )
        )


if __name__ == "__main__":
    unittest.main()
