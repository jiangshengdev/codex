import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import type { SkillMetadata, SkillsListResponse } from "@codex-protocol/v2";

export type SkillCatalogCandidate = Readonly<
  Pick<SkillMetadata, "name" | "description" | "shortDescription" | "interface" | "path" | "scope">
>;

type SkillCatalogContents = Readonly<{
  candidates: readonly SkillCatalogCandidate[];
  partialErrorCount: number;
}>;

export type SkillCatalogState =
  | (Readonly<{ type: "initialLoading" }> & SkillCatalogContents)
  | (Readonly<{ type: "ready" }> & SkillCatalogContents)
  | (Readonly<{ type: "refreshing" }> & SkillCatalogContents)
  | (Readonly<{ type: "stale" }> & SkillCatalogContents)
  | (Readonly<{ type: "failed" }> & SkillCatalogContents);

const emptyContents = (): SkillCatalogContents => ({
  candidates: [],
  partialErrorCount: 0,
});

type SkillCatalogOwnerOptions = Readonly<{
  cwd: string;
  listSkills: GuiHostCommands["listSkills"];
}>;

export class SkillCatalogOwner {
  private readonly cwd: string;
  private readonly listSkills: GuiHostCommands["listSkills"];
  private readonly listeners = new Set<() => void>();
  private state: SkillCatalogState = { type: "initialLoading", ...emptyContents() };
  private generation = 0;
  private started = false;
  private disposed = false;
  private requestInFlight = false;
  private refreshQueued = false;
  private hasSuccessfulCatalog = false;

  constructor({ cwd, listSkills }: SkillCatalogOwnerOptions) {
    this.cwd = cwd;
    this.listSkills = listSkills;
  }

  readonly getSnapshot = (): SkillCatalogState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) {
      return () => undefined;
    }

    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start(): boolean {
    if (this.started || this.disposed) {
      return false;
    }

    this.started = true;
    this.requestCatalog("initial");
    return true;
  }

  readonly invalidate = (): boolean => {
    if (!this.started || this.disposed) {
      return false;
    }

    if (this.requestInFlight) {
      if (this.refreshQueued) {
        return false;
      }
      this.refreshQueued = true;
      return true;
    }

    this.requestCatalog(this.hasSuccessfulCatalog ? "refresh" : "initial");
    return true;
  };

  readonly retry = (): boolean => {
    if (this.disposed || this.requestInFlight) {
      return false;
    }

    if (this.state.type === "failed") {
      this.requestCatalog("initial");
      return true;
    }
    if (this.state.type === "stale" || this.state.partialErrorCount > 0) {
      this.requestCatalog("refresh");
      return true;
    }
    return false;
  };

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.generation += 1;
    this.requestInFlight = false;
    this.refreshQueued = false;
    this.listeners.clear();
  }

  private requestCatalog(kind: "initial" | "refresh"): void {
    const generation = ++this.generation;
    this.requestInFlight = true;
    if (kind === "initial") {
      this.publish({ type: "initialLoading", ...emptyContents() });
    } else {
      this.publish({
        type: "refreshing",
        candidates: this.state.candidates,
        partialErrorCount: this.state.partialErrorCount,
      });
    }

    void this.listSkills({ cwds: [this.cwd], forceReload: false }).then(
      (response) => {
        if (!this.canSettle(generation)) {
          return;
        }

        this.requestInFlight = false;
        this.hasSuccessfulCatalog = true;
        this.publish({ type: "ready", ...catalogContentsForCwd(response, this.cwd) });
        this.startQueuedRefresh();
      },
      () => {
        if (!this.canSettle(generation)) {
          return;
        }

        this.requestInFlight = false;
        if (kind === "initial") {
          this.publish({ type: "failed", ...emptyContents() });
        } else {
          this.publish({
            type: "stale",
            candidates: this.state.candidates,
            partialErrorCount: this.state.partialErrorCount,
          });
        }
        this.startQueuedRefresh();
      },
    );
  }

  private startQueuedRefresh(): void {
    if (!this.refreshQueued || this.disposed) {
      return;
    }

    this.refreshQueued = false;
    this.requestCatalog(this.hasSuccessfulCatalog ? "refresh" : "initial");
  }

  private canSettle(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private publish(state: SkillCatalogState): void {
    if (this.disposed) {
      return;
    }

    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function catalogContentsForCwd(response: SkillsListResponse, cwd: string): SkillCatalogContents {
  const entry = response.data.find((candidate) => candidate.cwd === cwd);
  if (entry == null) {
    return emptyContents();
  }

  return {
    candidates: entry.skills.filter((skill) => skill.enabled).map(copyCandidate),
    partialErrorCount: entry.errors.length,
  };
}

function copyCandidate(skill: SkillMetadata): SkillCatalogCandidate {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.shortDescription == null ? {} : { shortDescription: skill.shortDescription }),
    ...(skill.interface == null ? {} : { interface: { ...skill.interface } }),
    path: skill.path,
    scope: skill.scope,
  };
}
