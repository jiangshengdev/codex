/** All paths use forward slashes and are relative to the codex-gui project root. */
export type BoundaryAudience = "production" | "testing";

export type BoundaryConsumer = { feature: string } | { file: string };

export type PublicBoundaryModule = {
  path: string;
  owner: string;
  /** Explicit exported names, including "default" when applicable; never "*". */
  exports: readonly string[];
  purpose: string;
  /** Production capabilities may also be consumed by tests. */
  audience: BoundaryAudience;
};

export type AllowedBoundaryDirection = {
  consumer: BoundaryConsumer;
  target: string;
  /** A production direction also permits testing consumers of that identity. */
  audience: BoundaryAudience;
};

export type KnownDirectionIssue = {
  from: string;
  to: string;
  issue: string;
  /** Documents retained ownership work; this record never grants access. */
  description: string;
};

export type BoundaryPolicy = {
  /** Directory names immediately below src/features; unknown features fail closed. */
  features: readonly string[];
  publicModules: readonly PublicBoundaryModule[];
  allowedDirections: readonly AllowedBoundaryDirection[];
  /** Exact outer test infrastructure paths, in addition to test file conventions. */
  testSupportFiles: readonly string[];
  knownDirectionIssues: readonly KnownDirectionIssue[];
};

export type BoundaryDiagnosticCode =
  | "invalid-policy"
  | "unknown-feature"
  | "unresolved-module"
  | "private-module"
  | "private-export"
  | "forbidden-direction"
  | "production-to-testing"
  | "indeterminate-access";

export type BoundaryDiagnostic = {
  file: string;
  /** One-based positions; policy diagnostics use the policy file and position 1. */
  line: number;
  column: number;
  code: BoundaryDiagnosticCode;
  message: string;
};

export type BoundaryAccess = {
  file: string;
  line: number;
  column: number;
  /** Resolved project-relative target. */
  target: string;
  /** Statically consumed names; "*" represents a whole-module access. */
  names: readonly string[];
};

export type BoundaryAnalysis = {
  diagnostics: BoundaryDiagnostic[];
  /** Every discovered source input, including declarations and untracked files. */
  files: string[];
  accesses: BoundaryAccess[];
};

export type AnalyzeProjectOptions = {
  /** Absolute codex-gui directory containing src and the existing tsconfig files. */
  projectRoot: string;
  policy: BoundaryPolicy;
};

/** analyze.ts exports a synchronous analyzeProject with this signature. */
export type AnalyzeProject = (options: AnalyzeProjectOptions) => BoundaryAnalysis;
