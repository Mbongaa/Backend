import type {
  MenuItem,
  ModifierGroup,
  ModifierValue,
  ProductModifierBinding,
  RecipeLine,
} from "../data";

export type ModifierSelection = Record<string, string[]>;

export const resolveModifierGroups = (
  item: Pick<MenuItem, "id" | "category">,
  bindings: ProductModifierBinding[],
): ModifierGroup[] => {
  const matches: ModifierGroup[] = [];
  const seen = new Set<string>();
  for (const binding of bindings) {
    const productMatch = binding.appliesTo.productIds?.includes(item.id);
    const categoryMatch = binding.appliesTo.categories?.includes(item.category);
    if (!productMatch && !categoryMatch) continue;
    for (const group of binding.groups) {
      if (seen.has(group.id)) continue;
      seen.add(group.id);
      matches.push(group);
    }
  }
  return matches;
};

export const defaultSelection = (groups: ModifierGroup[]): ModifierSelection => {
  const out: ModifierSelection = {};
  for (const group of groups) {
    const defaults = group.values.filter((v) => v.default).map((v) => v.id);
    if (defaults.length > 0) {
      out[group.id] = group.selection === "single" ? [defaults[0]] : defaults;
    } else if (group.required && group.selection === "single" && group.values[0]) {
      out[group.id] = [group.values[0].id];
    } else {
      out[group.id] = [];
    }
  }
  return out;
};

export const selectionIsComplete = (
  groups: ModifierGroup[],
  selection: ModifierSelection,
): boolean => {
  for (const group of groups) {
    if (!group.required) continue;
    const picked = selection[group.id] || [];
    if (picked.length === 0) return false;
    if (group.selection === "single" && picked.length !== 1) return false;
  }
  return true;
};

const flattenValues = (
  groups: ModifierGroup[],
  selection: ModifierSelection,
): { group: ModifierGroup; value: ModifierValue }[] => {
  const out: { group: ModifierGroup; value: ModifierValue }[] = [];
  for (const group of groups) {
    const picked = selection[group.id] || [];
    for (const valueId of picked) {
      const value = group.values.find((v) => v.id === valueId);
      if (value) out.push({ group, value });
    }
  }
  return out;
};

export const computePriceDelta = (
  groups: ModifierGroup[],
  selection: ModifierSelection,
): number => {
  let delta = 0;
  for (const { value } of flattenValues(groups, selection)) {
    if (typeof value.priceDelta === "number") delta += value.priceDelta;
  }
  return delta;
};

export const computeRecipeFactor = (
  groups: ModifierGroup[],
  selection: ModifierSelection,
): number => {
  let factor = 1;
  for (const { value } of flattenValues(groups, selection)) {
    if (typeof value.recipeFactor === "number") factor *= value.recipeFactor;
  }
  return factor;
};

export const buildVariantSignature = (selection: ModifierSelection): string => {
  // Sorted group keys + sorted value ids per group → deterministic, idempotent.
  const groupIds = Object.keys(selection).sort();
  const parts = groupIds
    .filter((g) => (selection[g] || []).length > 0)
    .map((g) => `${g}:${[...selection[g]].sort().join("+")}`);
  return parts.join("|");
};

export const scaledRecipe = (
  recipe: RecipeLine[],
  factor: number,
): RecipeLine[] =>
  recipe.map((line) => ({ ...line, qty: Math.round(line.qty * factor * 1e6) / 1e6 }));

export const summarizeSelection = (
  groups: ModifierGroup[],
  selection: ModifierSelection,
  lang: "en" | "ar" = "en",
): string => {
  const parts: string[] = [];
  for (const { value } of flattenValues(groups, selection)) {
    parts.push(value.name[lang] || value.name.en);
  }
  return parts.join(" · ");
};
