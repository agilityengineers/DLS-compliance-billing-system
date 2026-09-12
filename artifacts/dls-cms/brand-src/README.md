# Brand source — DLS mascot head

Approved transparent mascot artwork used for every head-only placement. The
complete DLS logo remains a separate asset and must not be replaced by this
head artwork.

| File | Role |
| --- | --- |
| `monkey-head.png` | Approved head artwork with a transparent background |
| `public/favicon.png` / `.ico` | Browser favicon |
| `public/brand/dls-mascot.png` | Default profile image |
| `public/icons/*` | PWA and install icons |

## Colors

| Token | Hex | Used for |
| --- | --- | --- |
| Brand plum | `#4A3D63` | Maskable and Apple icon backgrounds |

## Regenerating the raster icons

Replace `monkey-head.png` with the approved transparent artwork, then re-run
the generator. It rewrites every derived PNG/ICO under `public/`:

```bash
cd artifacts/dls-cms/brand-src
npm install --no-save sharp png-to-ico
node build-icons.mjs
```

After regenerating, bump `SHELL_CACHE` in `public/sw.js` — the service worker
serves `/icons/` and `/brand/` cache-first, so installed field devices keep the
old icons until the cache name changes.
