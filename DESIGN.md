# KuruBase dashboard design

## Signal Atlas / Nanoka lavender graphite

This is the single visual authority for the KuruBase administration dashboard. It is an Operate-mode interface for maintainers working across self-hosted projects.

### Visual system

- A compact persistent sidebar, quiet topbar, operational summary, and medium-density project grid establish the application shell.
- The palette is derived from the supplied Nanoka Kurobe reference: ivory, graphite, cool gray, muted plum, and lavender. Dark mode uses aubergine-charcoal surfaces rather than a mechanical inversion.
- Color is semantic: plum marks interaction and selection, a quieter mauve marks data context, and text plus iconography communicate every state without relying on color alone.
- Project identity is rendered through reusable `ProjectVisual` components. `automation` represents bots and event-driven services; `database` represents PostgreSQL, policies, and data workspaces.
- Project visuals use HTML, CSS, authored SVG icons, and theme tokens. Raster presets, generated backgrounds, `mix-blend-mode`, and theme-specific image assets are not part of the design.
- Status chips use intrinsic grids and card footers use content-aware columns so labels reflow without colliding with separators.

### Canonical implementation

- Application: `apps/dashboard/`
- Local preview: `node scripts/dashboard-server.mjs`
- Theme persistence: `localStorage` key `kurubase-theme`
- Supported layouts: desktop grid, intermediate two-column grid, and single-column mobile navigation.

No previous dashboard mockup, experimental palette, raster project preset, or intermediate preview server is canonical.
