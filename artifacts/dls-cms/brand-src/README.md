# Brand source — DLS mascot head

Vector source for every app icon. The monkey head is traced from the Durable
Life Skills logo mark, with the wordmark, vine and body removed so only the
head remains.

| File | Role |
| --- | --- |
| `monkey-head.svg` | The head alone, tight viewBox, transparent background |
| `favicon.svg` | Head on the brand plum circle — shipped as `public/favicon.svg` |
| `apple-touch-icon.svg` | Full-bleed plum square, head at 86% (iOS rounds the corners itself) |
| `icon-maskable.svg` | Full-bleed plum square, head at 78% so it survives Android's mask |

## Colors

| Token | Hex | Used for |
| --- | --- | --- |
| Brand plum | `#4A3D63` | Favicon / PWA badge, `manifest.json` `theme_color` |
| Avatar purple | `#685582` | `brand/dls-mascot.png`, the in-app avatar — unchanged |
| Straw | `#C29A56` / `#CBA660` | Hat |
| Hat band | `#4E2C7C` | Hat band |
| Fur | `#B09781` | Head |
| Muzzle | `#C4AC96` | Muzzle |
| Tongue | `#EA6D96` | Tongue |

## Regenerating the raster icons

Edit `monkey-head.svg`, then re-run the generator. It rewrites the other
source SVGs and every PNG/ICO under `public/`:

```bash
cd artifacts/dls-cms/brand-src
npm install --no-save sharp png-to-ico
node build-icons.mjs
```

After regenerating, bump `SHELL_CACHE` in `public/sw.js` — the service worker
serves `/icons/` and `/brand/` cache-first, so installed field devices keep the
old icons until the cache name changes.
