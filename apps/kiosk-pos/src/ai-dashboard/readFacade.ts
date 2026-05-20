import type { DataPackId, SourceRefRequirement } from "./componentRegistry";
import { buildEmptyDataPack, type DataPack, type DataPackScope } from "./dataPacks";

const FORBIDDEN_METHOD_NAMES = ["create", "submit", "review", "approve", "action", "upsert", "delete"] as const;

export type AiDashboardReadFacade = {
  readonly enabled: boolean;
  readonly readPack: (packId: DataPackId, scope: DataPackScope, requiredModels: readonly SourceRefRequirement[]) => Promise<DataPack>;
};

export function createAiDashboardReadFacade(): AiDashboardReadFacade {
  const facade: AiDashboardReadFacade = {
    enabled: true,
    async readPack(packId, scope, requiredModels) {
      return buildEmptyDataPack(packId, scope, requiredModels);
    },
  };

  assertNoForbiddenMethodNames(facade);
  return facade;
}

export function assertNoForbiddenMethodNames(value: Record<string, unknown>) {
  const keys = Object.keys(value);
  const forbidden = keys.filter((key) => FORBIDDEN_METHOD_NAMES.includes(key as (typeof FORBIDDEN_METHOD_NAMES)[number]));
  if (forbidden.length) {
    throw new Error(`AI read facade exposes forbidden method names: ${forbidden.join(", ")}`);
  }
}
