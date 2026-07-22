# Brand canon pointers (sdk)

This repo inherits Control brand canon via local symlinks (sibling `meum-control` clone).

| Path | Target |
| --- | --- |
| [`../VOICE.md`](../VOICE.md) | `meum-control/brand/VOICE.md` |
| [`../PRODUCT.md`](../PRODUCT.md) | `meum-control/brand/PRODUCT.md` (thin awareness) |
| [`concepts.md`](concepts.md) | `meum-control/brand/concepts.md` → vault domain glossary |

`concepts.md` lives here rather than the repo root because macOS default volumes are
case-insensitive and would collide with root [`CONCEPTS.md`](../CONCEPTS.md) (package/domain
seam vocabulary — not the brand glossary). Do not add `DESIGN.md`; this repo is docs-only for
brand inheritance.

See root `AGENTS.md` → **Brand canon**.
