// Demo-mode product catalog persistence.
// Stores menu items, recipes, and uploaded image overrides in localStorage so
// the Products & Recipes admin page survives soft reloads. When a real Odoo
// backend is wired in, this layer is replaced by reads/writes through
// /bayaan/api/products and /bayaan/api/recipe_version — the data shape here
// already mirrors what those endpoints will return.

export type ProductSize = string;

export type Product = {
  id: number;
  category: string;
  name: string;
  image: string;
  price: number;
  sizes: ProductSize[];
};

export type RecipeLine = {
  ingredient: string;
  qty: number;
  unit: string;
};

export type ProductRecipe = {
  productId: number;
  lines: RecipeLine[];
};

export type CatalogState = {
  version: 1;
  updatedAt: string;
  products: Product[];
  recipes: Record<number, ProductRecipe>;
  imagesBySlug: Record<string, string>;
};

export const CATALOG_VERSION = 1;
export const STORAGE_KEY = "bayaan.catalog.v1";

const isBrowser =
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export function loadCatalog(): CatalogState | null {
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version === CATALOG_VERSION && Array.isArray(parsed.products)) {
      return parsed as CatalogState;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCatalog(state: CatalogState): void {
  if (!isBrowser) return;
  try {
    const next = { ...state, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("Could not save catalog to localStorage:", err);
  }
}

export function clearCatalog(): void {
  if (!isBrowser) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function makeEmptyCatalog(
  seed: Product[],
  seedRecipes: Record<number, ProductRecipe> = {},
): CatalogState {
  return {
    version: CATALOG_VERSION,
    updatedAt: new Date().toISOString(),
    products: seed,
    recipes: seedRecipes,
    imagesBySlug: {},
  };
}

export function reconcileCatalogWithSeed(
  saved: CatalogState | null,
  seed: Product[],
  seedRecipes: Record<number, ProductRecipe> = {},
): CatalogState {
  if (!saved) return makeEmptyCatalog(seed, seedRecipes);

  const seedById = new Map(seed.map((product) => [product.id, product]));
  const seedImageSlugs = new Set(seed.map((product) => product.image).filter(Boolean));
  const imagesBySlug = saved.imagesBySlug ?? {};
  const seen = new Set<number>();

  const products = saved.products.map((product) => {
    seen.add(product.id);
    const seedProduct = seedById.get(product.id);
    if (!seedProduct) return product;

    const hasUploadedOverride = Boolean(product.image && imagesBySlug[product.image]);
    const hasKnownStaticImage = Boolean(product.image && seedImageSlugs.has(product.image));
    return {
      ...seedProduct,
      ...product,
      category: product.category || seedProduct.category,
      sizes: product.sizes?.length ? product.sizes : seedProduct.sizes,
      image: hasUploadedOverride || hasKnownStaticImage ? product.image : seedProduct.image,
    };
  });

  for (const product of seed) {
    if (!seen.has(product.id)) products.push(product);
  }

  return {
    ...saved,
    version: CATALOG_VERSION,
    products,
    recipes: { ...seedRecipes, ...(saved.recipes ?? {}) },
    imagesBySlug,
  };
}

export function nextProductId(products: Product[]): number {
  const max = products.reduce((m, p) => (p.id > m ? p.id : m), 0);
  return max + 1;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "product";
}

// Resize an uploaded image File to a square webp data URL.
// Center-crops to square (object-fit: cover behavior), draws to canvas, exports webp.
export async function resizeToWebp(
  file: File,
  size = 256,
  quality = 0.82,
): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2d context unavailable");
    const aspect = img.width / img.height;
    let sx = 0;
    let sy = 0;
    let sw = img.width;
    let sh = img.height;
    if (aspect > 1) {
      sw = img.height;
      sx = (img.width - sw) / 2;
    } else if (aspect < 1) {
      sh = img.width;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
    return canvas.toDataURL("image/webp", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}
