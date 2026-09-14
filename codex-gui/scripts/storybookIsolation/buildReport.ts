import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin, Rolldown } from "vite";

function collectBuildReport(bundle: Rolldown.OutputBundle, modules: string[]) {
  return {
    modules,
    files: Object.values(bundle).map((output) => ({
      fileName: output.fileName,
      sha256: createHash("sha256")
        .update(output.type === "chunk" ? output.code : output.source)
        .digest("hex"),
    })),
    chunks: Object.values(bundle).flatMap((output) =>
      output.type === "chunk" ? [{ fileName: output.fileName, modules: output.moduleIds }] : [],
    ),
  };
}

export type BuildReport = ReturnType<typeof collectBuildReport>;

// Opt-in observation writes outside the release directory and changes no bundle options.
export function storybookIsolationReport(): Plugin | undefined {
  const reportPath = process.env.CODEX_GUI_STORYBOOK_ISOLATION_REPORT;
  if (!reportPath) return;
  return {
    name: "codex-gui-storybook-isolation-report",
    apply: "build",
    async writeBundle(_options, bundle) {
      const report = collectBuildReport(bundle, [...this.getModuleIds()]);
      await mkdir(path.dirname(reportPath), { recursive: true });
      await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    },
  };
}
