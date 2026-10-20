# Architecture Decision Record (ADR)

## ADR-001 — Preserve Tauri 2 starter and dual-architecture Windows packaging
**Status:** Accepted (2026-10-20)

**Decision:** Maintain Vite + vanilla JS, Tauri 2, Rust, NSIS installers, Windows x64 + ARM64. Do not replace Windows shell. A React/TypeScript migration is not a prerequisite for Phase 1.

**Rationale:** The source already uses these components; incremental work has lower regression risk and supports relevant device architectures.

## ADR-002 — Prefer stable `WebviewWindow` for initial in-app browsing
**Status:** Accepted for proof-of-concept; persistent touch controls still to be validated (2026-10-20)

**Decision:** Build remote browsing first with Tauri's stable `WebviewWindow` API. Treat remote content as untrusted; no privileged Tauri capabilities. Only investigate child webviews after testing the return-to-Home UX under real Windows conditions.

**Rationale:** Child `Webview` creation currently requires unstable Tauri feature. HTML iframes cannot host arbitrary service sites reliably.

**Exit gate:** A touch-friendly native/Home return control works even when the site is fullscreen, focused and in portrait mode. If not, document experimental fallback and re-evaluate.

## ADR-003 — Explicit provider-aware launch routing
**Status:** Accepted (2026-10-20)

**Decision:** Shortcuts have Auto/Internal/External. Known DRM-restricted providers default External; the UI describes compatibility and limitations.

**Rationale:** WebView2 is not guaranteed to support streaming authentication and protected playback across providers.

## ADR-004 — No remote-to-native bridge
**Status:** Non-negotiable (2026-10-20)

**Decision:** Third-party origins are not granted Tauri capabilities, remote webviews cannot invoke launcher/system commands; use a strict local CSP and Rust-side validation.

**Rationale:** The launcher can open apps and later access local/media-server data. Giving native APIs to an arbitrary site creates a serious attack surface.

## ADR template for subsequent changes

- **Date / owner:**
- **Context / evidence:**
- **Decision / rejected alternatives:**
- **Security/UX impact:**
- **Tests:**
- **Follow-up:**
