import { describe, expect, it } from "vitest";
import { componentRegistry } from "./componentRegistry";
import docMarkdown from "../../../../docs/ai-dashboard-manager-component-map.md?raw";

function extractDocComponentIds(markdown: string): string[] {
  const ids: string[] = [];
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const match = /^\s*-\s*`([a-z0-9_.-]+)`/.exec(line);
    if (match) {
      const id = match[1];
      if (id === "createSourceOfTruthGateway" || id === "proposeAction") continue;
      ids.push(id);
    }
  }
  return [...new Set(ids)].sort();
}

describe("AI dashboard component registry", () => {
  it("covers all component IDs listed in docs/ai-dashboard-manager-component-map.md", () => {
    const docIds = extractDocComponentIds(docMarkdown);
    const registryIds = new Set<string>(componentRegistry.map((entry) => entry.id));
    const missing = docIds.filter((id) => !registryIds.has(id));

    expect(missing).toEqual([]);
  });
});
