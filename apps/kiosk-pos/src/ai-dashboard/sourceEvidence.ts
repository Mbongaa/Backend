import type { SourceRefRequirement } from "./componentRegistry";

export type SourceEvidenceRef = {
  readonly model: SourceRefRequirement;
  readonly ref: string;
  readonly label?: string;
  readonly rowCount?: number;
  readonly filters?: Readonly<Record<string, string | number | boolean | null>>;
  readonly asOf?: string;
};

export type SourceEvidence = {
  readonly requiredModels: readonly SourceRefRequirement[];
  readonly refs: readonly SourceEvidenceRef[];
  readonly generatedAt: string;
  readonly empty: boolean;
};

export function buildEmptySourceEvidence(
  requiredModels: readonly SourceRefRequirement[],
  generatedAt: string = new Date().toISOString(),
): SourceEvidence {
  return {
    requiredModels,
    refs: [],
    generatedAt,
    empty: true,
  };
}

export function assertEvidenceCoversRequiredModels(evidence: SourceEvidence) {
  if (evidence.empty) return;

  const seen = new Set(evidence.refs.map((ref) => ref.model));
  const missing = evidence.requiredModels.filter((model) => !seen.has(model));
  if (missing.length) {
    throw new Error(`Source evidence missing required models: ${missing.join(", ")}`);
  }
}
