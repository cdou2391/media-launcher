# AURA Development Progress

**Last updated:** 2026-10-20. **Scope:** Phase 0 then Phase 1 only.

Phase 0 frontend safeguards and Phase 1 application code are implemented. Phase 0 and Phase 1 exit gates remain OPEN because native compilation, WebView2 isolation and physical Surface acceptance are not verified. No Phase 2+ feature was added.

## Implemented

- Dependency lockfiles, pinned JS dependencies and Rust toolchain, ESLint/Prettier, Node tests, Playwright preview tests and separate Windows x64/ARM64 CI checks.
- Restrictive local CSP; imported Tauri APIs; explicit command ACL per local window; native caller-origin/label/route and URL/path checks; remote origins never granted capabilities.
- Versioned v2 shortcuts with v1 backup and migration, favorites/display preservation, safe empty collections and visible session-only recovery when storage is unreadable/unavailable.
- Add/edit Auto/Internal/External modes and HTTP consent. Shared provider-domain policy drives both JS display and Rust enforcement. Known restricted services default to External in Auto.
- Stable remote WebviewWindow plus owned, trusted Home/Retry/External controls. One service session, guarded lifecycle cleanup, Home restoration/focus, blocked unsafe navigation/popups/downloads, slow-load messaging and explicit fallback.
- Browser preview states the native limitation instead of representing an external tab as internal browsing.

## Actual local evidence

Environment: Windows x64 execution host, Node 24.19.0; project-local npm bootstrap; isolated Rust 1.99.1 MSVC toolchain; installed headless Google Chrome. No physical Surface interaction. No native AURA executable launched.

| Check                                                                  | Result                                                       | Meaning                                                                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency installation                                                | PASS; npm reported zero known vulnerabilities during install | package-lock.json created; not a complete security audit                                                                                                  |
| npm run lint                                                           | PASS                                                         | ESLint over JS source/config/tests                                                                                                                        |
| npm run format:check                                                   | PASS                                                         | Prettier formatting                                                                                                                                       |
| npm test                                                               | PASS, 14 tests                                               | Migration/recovery, routing/HTTP, URL/path validation, capability/CSP configuration                                                                       |
| npm run build                                                          | PASS                                                         | Vite bundles both Home and local toolbar                                                                                                                  |
| npm run test:ui                                                        | PASS, 12 tests in headless Chrome                            | Preview CRUD/persistence, favorites/search/accents, HTTP consent, modal focus, offline shell/exit, toolbar sizing, mocked IPC/fallback and production CSP |
| cargo fmt --manifest-path src-tauri/Cargo.toml -- --check              | PASS                                                         | Rust syntax parsed and formatted; not typechecking                                                                                                        |
| cargo generate-lockfile --manifest-path src-tauri/Cargo.toml --offline | PASS                                                         | Rust dependency graph locked                                                                                                                              |
| cargo check --manifest-path src-tauri/Cargo.toml                       | BLOCKED                                                      | MSVC link.exe missing; fails in dependency build scripts before checking application types                                                                |
| npm run tauri:dev -- --no-watch                                        | BLOCKED                                                      | Same missing linker; concurrent preview also occupied fixed port 5173                                                                                     |
| Rust unit tests / native launch / IPC negative tests                   | NOT RUN                                                      | Require C++/SDK prerequisites and native app                                                                                                              |
| Windows CI and installer packaging                                     | NOT YET VERIFIED                                             | Workflow configuration alone is not build evidence                                                                                                        |
| Physical x64/ARM64 Surface tests                                       | NOT RUN                                                      | Touch, DPI, rotation, fullscreen, provider playback and lifecycle acceptance are open                                                                     |

Two initial preview checks failed (cold-start timeout; incomplete Tauri mock) and were corrected. The production-CSP fixture initially failed on a missing favicon; it now returns 404 correctly. The subsequent complete browser run passed all twelve tests. Mocked IPC tests are explicitly named as mocks and do not establish native capability enforcement.

## Milestone tracker

| ID    | Milestone                                                           | Status                                                             |
| ----- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| P0    | Baseline checks, CSP, command hardening, lockfiles and test harness | Implemented; native build/launch gate blocked                      |
| P1    | Embedded service window and touch-visible Home path                 | Proof-of-concept code implemented; native/hardware acceptance OPEN |
| P2–P6 | Discovery, integrations, polish, broader security/release           | NOT STARTED                                                        |

## Changed files

Frontend: index.html; browser.html; package.json; package-lock.json; vite.config.js; eslint.config.js; .prettierignore; .gitignore; .gitattributes; playwright.config.js; src/main.js; src/native.js; src/style.css; src/browser-controls.js; src/browser-controls.css; src/services/defaults.js; src/services/targets.js; src/services/shortcuts.js; src/services/launch-router.js; src/services/provider-policy.json.

Native: rust-toolchain.toml; src-tauri/Cargo.toml; src-tauri/Cargo.lock; src-tauri/build.rs; src-tauri/tauri.conf.json; src-tauri/capabilities/default.json; src-tauri/capabilities/browser-controls.json; src-tauri/src/lib.rs; src-tauri/src/security.rs; src-tauri/src/policy.rs; src-tauri/src/launch.rs; src-tauri/src/browser.rs.

Tests/CI: tests/targets.test.js; tests/shortcuts.test.js; tests/routing.test.js; tests/security-config.test.js; tests/ui/home.spec.js; tests/ui/controls.spec.js; tests/ui/csp.spec.js; .github/workflows/windows-build.yml.

Handoff: README.md; docs/PROGRESS.md; docs/DECISIONS.md; docs/ARCHITECTURE.md; docs/ACCEPTANCE_TESTS.md; docs/PHASE_1_SPIKE.md. Existing compressed source and touched documentation were formatted when introducing formatting checks. The cinematic layout was preserved.

## Blockers and next checklist item

Install the Windows C++/SDK prerequisites (or obtain passing native CI), then execute the [stable-window spike](PHASE_1_SPIKE.md) on x64 and ARM64 devices. Record native compile/typechecking results before calling the code buildable. Test visible Home while the remote site is focused/fullscreen, rotation/DPI/task switching, ten reopen cycles and every remote IPC denial. Update the acceptance matrix with actual hardware/build evidence. Only if the stable owned-window approach fails these native tests should a documented child-webview experiment be considered. Do not start Phase 2.
