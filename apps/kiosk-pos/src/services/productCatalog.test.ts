import { describe, expect, it } from "vitest";
import { reconcileCatalogWithSeed, type CatalogState, type Product } from "./productCatalog";

const seed: Product[] = [
  { id: 1, category: "Hot Coffee", name: "Latte", image: "latte", price: 7500, sizes: ["M"] },
  { id: 2, category: "Juice", name: "Orange", image: "juice-orange", price: 7500, sizes: ["M"] },
];

describe("reconcileCatalogWithSeed", () => {
  it("repairs stale seeded image slugs from older localStorage catalogs", () => {
    const saved: CatalogState = {
      version: 1,
      updatedAt: "2026-05-12T00:00:00.000Z",
      products: [
        { id: 1, category: "Hot Coffee", name: "Latte", image: "latte", price: 7500, sizes: ["M"] },
        { id: 2, category: "Juice", name: "Orange", image: "orange", price: 7500, sizes: ["M"] },
      ],
      recipes: {},
      imagesBySlug: {},
    };

    const reconciled = reconcileCatalogWithSeed(saved, seed);

    expect(reconciled.products.find((product) => product.id === 2)?.image).toBe("juice-orange");
  });

  it("keeps user-uploaded custom image overrides", () => {
    const saved: CatalogState = {
      version: 1,
      updatedAt: "2026-05-12T00:00:00.000Z",
      products: [
        { id: 2, category: "Juice", name: "Orange", image: "orange-custom", price: 7500, sizes: ["M"] },
      ],
      recipes: {},
      imagesBySlug: { "orange-custom": "data:image/webp;base64,AAAA" },
    };

    const reconciled = reconcileCatalogWithSeed(saved, seed);

    expect(reconciled.products.find((product) => product.id === 2)?.image).toBe("orange-custom");
  });

  it("adds newly seeded products missing from an older saved catalog", () => {
    const reconciled = reconcileCatalogWithSeed({
      version: 1,
      updatedAt: "2026-05-12T00:00:00.000Z",
      products: [seed[0]],
      recipes: {},
      imagesBySlug: {},
    }, seed);

    expect(reconciled.products.map((product) => product.id)).toEqual([1, 2]);
  });

  it("backfills seeded recipes without overwriting edited recipes", () => {
    const reconciled = reconcileCatalogWithSeed({
      version: 1,
      updatedAt: "2026-05-12T00:00:00.000Z",
      products: seed,
      recipes: {
        1: { productId: 1, lines: [{ ingredient: "Custom beans", qty: 0.02, unit: "kg" }] },
      },
      imagesBySlug: {},
    }, seed, {
      1: { productId: 1, lines: [{ ingredient: "Espresso beans - house", qty: 0.018, unit: "kg" }] },
      2: { productId: 2, lines: [{ ingredient: "Oranges", qty: 0.35, unit: "kg" }] },
    });

    expect(reconciled.recipes[1]?.lines[0]?.ingredient).toBe("Custom beans");
    expect(reconciled.recipes[2]?.lines[0]?.ingredient).toBe("Oranges");
  });
});
