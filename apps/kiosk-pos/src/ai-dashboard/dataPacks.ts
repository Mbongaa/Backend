import type { DataPackId, SourceRefRequirement } from "./componentRegistry";
import { assertEvidenceCoversRequiredModels, buildEmptySourceEvidence, type SourceEvidence } from "./sourceEvidence";

export type DataPackScope = {
  readonly kioskId?: string;
  readonly sectionId?: string;
  readonly timeRange: "today" | "week" | "month" | "custom";
};

export type DataPackLimits = {
  readonly maxRows: number;
  readonly truncated: boolean;
};

export type DataPackMeta = {
  readonly id: DataPackId;
  readonly scope: DataPackScope;
  readonly generatedAt: string;
  readonly limits: DataPackLimits;
};

export type DataPack<
  TMetrics extends Record<string, unknown> = Record<string, unknown>,
  TRow extends Record<string, unknown> = Record<string, unknown>,
> = DataPackMeta & {
  readonly metrics: TMetrics;
  readonly rows: readonly TRow[];
  readonly sourceEvidence: SourceEvidence;
};

export function buildEmptyDataPack(
  id: DataPackId,
  scope: DataPackScope,
  requiredModels: readonly SourceRefRequirement[],
  generatedAt: string = new Date().toISOString(),
): DataPack {
  return {
    id,
    scope,
    generatedAt,
    limits: { maxRows: 0, truncated: false },
    metrics: {},
    rows: [],
    sourceEvidence: buildEmptySourceEvidence(requiredModels, generatedAt),
  };
}

export function assertDataPackEvidence(pack: DataPack) {
  assertEvidenceCoversRequiredModels(pack.sourceEvidence);
}
