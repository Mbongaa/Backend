# Product images

Drop `<slug>.webp` files here. Vite serves them at `/products/<slug>.webp`.

Until a file exists for a given slug, the POS tile renders a first-letter fallback (no broken-image icon, no 404 noise). Add files one at a time as you generate them — no code changes required.

## Required slugs (29)

### Hot Coffee
- `espresso.webp`
- `americano.webp`
- `flat-white.webp`
- `latte.webp`
- `cappuccino.webp`
- `cortado.webp`
- `mocha.webp`
- `spanish-latte.webp`

### Iced Coffee
- `iced-americano.webp`
- `iced-latte.webp`
- `iced-mocha.webp`
- `cold-brew.webp`
- `iced-spanish.webp`

### Juice
- `juice-orange.webp`
- `juice-mango.webp`
- `juice-strawberry.webp`
- `juice-avocado.webp`
- `mint-lemonade.webp`

### Cake
- `cake-pistachio.webp`
- `cake-chocolate-fondant.webp`
- `cake-cheesecake.webp`
- `cake-carrot.webp`
- `cake-tiramisu.webp`
- `cake-lotus.webp`

### Bakery
- `croissant-plain.webp`
- `croissant-chocolate.webp`
- `croissant-almond.webp`
- `cinnamon-roll.webp`
- `zaatar-manakeesh.webp`

## Spec

- **Square 1024×1024** (downscale to 256×256 webp before commit if you want to keep the repo small — the POS tile renders at 56px so anything ≥256px is plenty).
- **webp**, quality ~80, ~15–25 KB per file at 256×256.
- **Neutral off-white background** (`#F8F6F1` matches the design) or transparent.
- **Single product centered**, soft natural daylight, slight 30° angle, consistent vessel within each category. No text, no logos, no human hands.

## Adding a new product later

1. Add a row to `MOCK.posMenu` in `src/exact-design/ExactKioskApp.jsx` with an `image: "your-slug"` field.
2. Drop `your-slug.webp` in this folder.
3. Reload. Done.
