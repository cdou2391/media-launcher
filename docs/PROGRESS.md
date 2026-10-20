# AURA Development Progress

**Last updated:** 2026-10-20. **Scope:** Phase 0 then Phase 1 only.

Phase 0 safeguards and Phase 1 application code are implemented. Both architectures build and pass Rust tests in CI; the x64 package passes real WebView2 automation. Phase exit gates remain OPEN for physical touch/fullscreen/DPI/rotation, ARM64 runtime, provider login/playback and remaining baseline local-file/app launch checks. No Phase 2+ feature was added.

## Entertainment banner - built and x64 runtime validated

Replaced the abstract Home hero decoration with a locally bundled, generated cinematic portrait collage of contemporary actors and singers. The existing gold A/arrow remain crisp HTML/CSS overlays and visible at every breakpoint. Wide layouts keep the copy on the left; layouts at 1180px and below show the full artwork above the copy so faces are not cropped. The generated PNG is 2172 × 724; [artwork notes and exact prompt](BANNER_ARTWORK.md) record the built-in tool mode.

**Exact changed files:** index.html; src/style.css; src/assets/aura-entertainment-banner-v1.png (new); docs/BANNER_ARTWORK.md (new); docs/BANNER_NATIVE_RESULT.json (new build evidence); README.md; docs/PROGRESS.md.

**Actual checks:** lint/format, 22 Node/config tests, Vite production build and all 16 Chrome-preview UI tests PASS locally. Visually inspected browser screenshots at 1920, 1440, 1280, 1180, 900, 800, 480 and 360px viewport widths; the image loads, the A is visible and no horizontal page overflow occurs. The production image also decodes successfully under the native CSP in Chrome. The wide layout preserves the artwork's 3:1 ratio on larger screens.

**Windows build and delivery:** [CI source 6280746](https://github.com/cdou2391/media-launcher/actions/runs/39437904384) passes frontend/browser checks and six Rust tests independently on x64 and ARM64, and builds both release installers. Downloaded archive SHA256 values match GitHub artifact digests; extracted executables have the expected x64/ARM64 PE architectures. AURA-Banner-Test beside this repository contains the standalone x64 AURA.exe, optional x64 installer, separate ARM64 installer, SHA256SUMS.txt, START-HERE.txt, native results and an actual native banner screenshot. Older build folders remain intact. No installer was run.

**Exact delivered EXE runtime:** Windows 10.0.26200 x64 / WebView2 155.0.4283.62 PASS: embedded artwork decodes at 2172 × 724 and matches the source PNG SHA256; A is visible with no horizontal page overflow. The image was visually inspected in the actual packaged app. The focused check waits for the local page and reads its cached image through the debugger resource API because the native CSP correctly blocks page-script fetch; no CSP or production code was changed for testing. The existing native suite also PASS: HTTPS rendering, migration/restart persistence, ten service/Home cycles, all four sidebar destinations, fullscreen bounds, 12 remote IPC denials, foreground site usage, pause/clear, native minimize/restore, usage restart persistence and Exit. [Exact evidence and delivered hashes](BANNER_NATIVE_RESULT.json). Test instances used isolated profiles with normal desktop permissions. Follow-up evidence/documentation changes leave production/build inputs identical to the CI source commit.

**Next / unverified:** test the delivered EXE on physical Surface touch/DPI/rotation; run ARM64 on an ARM64 device, verify provider login/playback and installer install/uninstall. No new physical hardware acceptance is claimed.

## Usage tracking in Settings - implemented and validated

Implemented the user's requested local usage view: overall AURA foreground time, internal-site time, per-shortcut launch counts and last launch, persistent tracking toggle, and separately confirmed history clear. External launches show duration Unavailable rather than guessing time outside AURA. No targets, browsing history, credentials or analytics requests are recorded. A narrow native command checks only AURA's foreground HWND, including while its remote child has focus. Optional shortcut ID/session metadata links native service time to the correct shortcut. Tracking begins with this version, with no historical backfill.

Versioned usage storage is separate from settings. Pausing stops counts/time; clear preserves shortcuts/preferences. Corrupt/future data is preserved and paused; unavailable storage retains session totals with a notice. One-second sampling drops long gaps/clock discontinuities; five-second checkpoints plus lifecycle flushes limit crash loss without backfilling a restart.

**Exact changed files in this addition:** index.html; src/main.js; src/style.css; src/components/usage-panel.js (new); src/services/usage.js (new); src-tauri/src/lib.rs; src-tauri/src/browser.rs; src-tauri/src/usage.rs (new); src-tauri/build.rs; src-tauri/capabilities/default.json; tests/usage.test.js (new); tests/ui/usage.spec.js (new); tests/native-smoke.mjs; README.md; docs/DECISIONS.md; docs/PROGRESS.md; docs/ARCHITECTURE.md; docs/ACCEPTANCE_TESTS.md; docs/USAGE_NATIVE_RESULT.json (new).

**Actual checks:** lint/format, production build, 22 Node/config tests and 16 Chrome-preview tests PASS locally. [CI source a1d62a5](https://github.com/cdou2391/media-launcher/actions/runs/39432224423) passes 16 UI tests plus 6 Rust tests independently on x64 and ARM64 and produces both release NSIS installers. Final test/evidence/documentation follow-ups leave production/build inputs identical to this commit. [Exact delivered x64 EXE evidence and hashes](USAGE_NATIVE_RESULT.json): Windows 10.0.26200 / WebView2 155.0.4283.62 PASS foreground site timing with the actual remote document focused, per-shortcut counts, pause, clear/cancel, actual native minimized duration exclusion/restore, full native process restart persistence (including paused setting), 12 remote IPC denials, and prior navigation/security/HTTPS checks. All thirteen native check statements pass. Earlier sidebar evidence is retained as history, not used as a usage result.

**Test-harness corrections:** the first ARM64 browser run exposed comparisons against stale five-second checkpoints and a corruption fixture written before an old page's valid pagehide flush. Fixtures now compare settled inactive checkpoints and seed corrupt data in the new document. Native checkpoints use the same settled-state approach. A helper script-file invocation was blocked by execution policy; it now supplies one complete inline PowerShell command, validates only the test process/path, and never changes execution policy or forces foreground activation. These were harness corrections; no application fix is claimed for them. Native tests run outside the restricted tool sandbox with normal desktop permissions and an isolated profile.

**Delivery:** AURA-Usage-Test beside the repository contains the exact tested x64 AURA.exe, optional x64 installer, separate ARM64 installer, checksums and START-HERE.txt. Earlier test-build folders remain separate. Native automation did not modify a personal profile or run an installer.

**Still open / next:** physically test Settings, pause/resume and background/foreground transitions by touch on Surface; verify sleep/lock and mixed-DPI/rotation on hardware. ARM64 runtime, provider playback, installer install/uninstall and external duration measurement remain unverified/unsupported as labeled. Foreground time is approximate, not playback or attention measurement. Phase 1 physical gates remain open; no discovery/integration scope was added.

## Persistent sidebar follow-up � implemented and x64 runtime validated

The user's Windows screenshot showed the floating return panel obscuring YouTube. ADR-008 records that stable-spike deficiency and the explicit `embedded-browser` child-webview experiment, pinned to Tauri 2.12.4. The remote child reserves the existing 90px sidebar and 128px trusted header in the main window. All four rail destinations close the service and open the chosen AURA view. The former browser.html, controls JS/CSS and controls capability are removed. Native command checks inspect the invoking Webview and grants target only the exact local `main` webview, never the shared window. Native mutations serialize; resize/DPI bounds preserve chrome.

**Source/binary:** 32e0a9ccf79564f85e6f360a2a6522903ae24727; [successful CI](https://github.com/cdou2391/media-launcher/actions/runs/39425973205), [exact native evidence and hashes](SIDEBAR_NATIVE_RESULT.json). Final follow-up source changes are test/documentation only; native/build inputs match this tested commit. The proposed resize callback change was withdrawn after normal-permission testing established that the first startup failure was confined to the restricted tool environment, including with the earlier stable executable.

**Actual checks:** lint/format, 14 Node tests, production Vite build and Rust formatting PASS locally; 12 Chrome-preview tests PASS locally and on both CI runners; six Rust tests plus release NSIS packaging PASS independently on x64 and ARM64. Real x64 Windows 10.0.26200 / WebView2 155.0.4283.62 PASS: HTTPS 200/rendered document, v1 migration and full process restart persistence, 11 remote IPC ACL denials, popup/privileged-origin block warnings, original-target Retry, ten child-view Home cycles, all four rail destinations without delayed-event navigation errors, reserved native bounds during a site's actual fullscreen request, and Exit. No floating control window is created (one local and one remote WebView2 page per session).

**Environment limit:** the initial native attempt inside the restricted tool sandbox could not initialize the local WebView2 target. The same installer/executable passes with normal desktop permissions and an isolated profile. No production code fix is claimed for that environment failure.

**Exact changed files:** README.md; index.html; vite.config.js; src/main.js; src/style.css; src-tauri/Cargo.toml; src-tauri/capabilities/default.json; src-tauri/src/browser.rs; src-tauri/src/lib.rs; src-tauri/src/security.rs; tests/native-smoke.mjs; tests/security-config.test.js; tests/ui/controls.spec.js; tests/ui/csp.spec.js; tests/ui/home.spec.js; docs/ARCHITECTURE.md; docs/DECISIONS.md; docs/PROGRESS.md; docs/ACCEPTANCE_TESTS.md; docs/PHASE_1_SPIKE.md; docs/SIDEBAR_NATIVE_RESULT.json. Deleted: browser.html; src/browser-controls.js; src/browser-controls.css; src-tauri/capabilities/browser-controls.json.

**Delivery:** the separate AURA-Sidebar-Test folder beside this repository contains a verified x64 standalone AURA.exe, optional x64 installer, separate ARM64 installer, checksums and START-HERE.txt. The previous AURA-Test-Build folder is retained. No installer was run or personal profile modified by native automation.

**Still open / next:** physical Surface touch hit-testing while the remote child has focus/fullscreen, real DPI/rotation/multi-monitor changes, ARM64 app runtime, provider login/playback, normal local app/media launch and installer install/uninstall. Native DOM visibility and bounds assertions do not establish physical touch/z-order acceptance. Complete those Phase 1 gates before Phase 2.

## Implemented

- Dependency lockfiles, pinned JS dependencies and Rust toolchain, ESLint/Prettier, Node tests, Playwright preview tests and separate Windows x64/ARM64 CI checks.
- Restrictive local CSP; imported Tauri APIs; explicit command ACL per local window; native caller-origin/label/route and URL/path checks; remote origins never granted capabilities.
- Versioned v2 shortcuts with v1 backup and migration, favorites/display preservation, safe empty collections and visible session-only recovery when storage is unreadable/unavailable.
- Add/edit Auto/Internal/External modes and HTTP consent. Shared provider-domain policy drives both JS display and Rust enforcement. Known restricted services default to External in Auto.
- Stable remote WebviewWindow plus owned, trusted Home/Retry/External controls. One service session, guarded lifecycle cleanup, Home restoration/focus, blocked unsafe navigation/popups/downloads, slow-load messaging and explicit fallback.
- Browser preview states the native limitation instead of representing an external tab as internal browsing.

## Actual evidence

Local host: Windows x64 build 10.0.26200, Node 24.19.0, isolated Rust 1.99.1, headless Chrome, WebView2 155.0.4283.62. No physical Surface interaction. The local native compiler is blocked by missing MSVC link.exe, so the packaged x64 executable was extracted from the CI installer and tested without installation, using isolated WebView2 data.

Source commit: 8569144e0a561ca870dd693fd9ab2c2b7d9385bf. [CI run](https://github.com/cdou2391/media-launcher/actions/runs/39412058478) completed successfully on independent Windows x64 and ARM64 runners.

| Check                                                      | Actual result                | Scope                                                                                      |
| ---------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| npm run check                                              | PASS                         | ESLint, Prettier, 14 Node/config tests and both Vite entry points                          |
| npm run test:ui                                            | PASS, 12 tests               | Chrome preview, production CSP, storage/editing/navigation and explicitly mocked IPC cases |
| cargo fmt and locked manifest/graph                        | PASS                         | Local syntax/format/lock checks                                                            |
| Native Rust tests in CI                                    | PASS, 5 on each architecture | x86_64-pc-windows-msvc and aarch64-pc-windows-msvc                                         |
| Native release installers in CI                            | PASS, both architectures     | Separate NSIS artifacts, hashes in NATIVE_SMOKE_RESULT.json                                |
| Extracted x64 executable startup/HTTPS                     | PASS                         | Real WebView2, https://example.com response 200 and rendered document                      |
| Remote IPC isolation                                       | PASS, 8 native ACL denials   | Controlled untrusted HTTP fixture; no privileged command succeeded                         |
| Popup/local-origin navigation and Retry                    | PASS                         | Native blocked statuses remain visible; Retry reissues original request                    |
| Native lifecycle                                           | PASS                         | Ten service/Home cycles, both service/control close requests and Exit                      |
| Native migration/persistence                               | PASS                         | v1 favorite, color, mark, accent retained through reload and full app-process restart      |
| Physical Surface, ARM64 runtime, provider playback         | NOT RUN                      | Still release/acceptance gates                                                             |
| Installer install/uninstall, native local app/media launch | NOT RUN                      | Builds are not installer or baseline launch acceptance                                     |

The first native run exposed a real WebView2 event-ordering issue: cancelled load events overwrote blocked-navigation warnings. The final code preserves those warnings until a trusted Retry/new session and includes a Rust regression test. An HTTPS assertion also assumed an obsolete page heading; it now verifies the actual response and rendered document. The final native smoke run passes. A lingering early preview process also exposed Vite watching locked downloaded native files; development watchers now ignore .tools, Rust outputs, generated schemas and test artifacts. Raw failures are retained only in ignored local test artifacts; sanitized final evidence is in [NATIVE_SMOKE_RESULT.json](NATIVE_SMOKE_RESULT.json).

## Milestone tracker

| ID    | Milestone                                                           | Status                                                                                        |
| ----- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| P0    | Baseline checks, CSP, command hardening, lockfiles and test harness | Implemented; build and native x64 automation pass; remaining baseline/hardware checks open    |
| P1    | Embedded service window and touch-visible Home path                 | Native x64 proof of concept passes automation; physical Surface/ARM64 runtime acceptance OPEN |
| P2–P6 | Discovery, integrations, polish, broader security/release           | NOT STARTED                                                                                   |

## Changed files

Frontend: index.html; browser.html; package.json; package-lock.json; vite.config.js; eslint.config.js; .prettierignore; .gitignore; .gitattributes; playwright.config.js; src/main.js; src/native.js; src/style.css; src/browser-controls.js; src/browser-controls.css; src/services/defaults.js; src/services/targets.js; src/services/shortcuts.js; src/services/launch-router.js; src/services/provider-policy.json.

Native: rust-toolchain.toml; src-tauri/Cargo.toml; src-tauri/Cargo.lock; src-tauri/build.rs; src-tauri/tauri.conf.json; src-tauri/capabilities/default.json; src-tauri/capabilities/browser-controls.json; src-tauri/src/lib.rs; src-tauri/src/security.rs; src-tauri/src/policy.rs; src-tauri/src/launch.rs; src-tauri/src/browser.rs.

Tests/CI: tests/native-smoke.mjs; tests/targets.test.js; tests/shortcuts.test.js; tests/routing.test.js; tests/security-config.test.js; tests/ui/home.spec.js; tests/ui/controls.spec.js; tests/ui/csp.spec.js; .github/workflows/windows-build.yml.

Handoff: docs/NATIVE_SMOKE_RESULT.json; README.md; docs/PROGRESS.md; docs/DECISIONS.md; docs/ARCHITECTURE.md; docs/ACCEPTANCE_TESTS.md; docs/PHASE_1_SPIKE.md. Existing compressed source and touched documentation were formatted when introducing formatting checks. The cinematic layout was preserved.

## Blockers and next checklist item

Run the [hardware spike](PHASE_1_SPIKE.md) on physical x64 and ARM64 Surfaces: Home must remain touch-visible with the remote page focused/fullscreen, across rotation/DPI/task switching. Confirm provider login/playback and a self-hosted Jellyfin instance independently; test native app/media launch and installer install/uninstall. ARM64 currently has compile/unit/packaging evidence only. The local build machine also needs Visual Studio C++/SDK tools for direct compilation. Do not label Phase 1 physically accepted or start Phase 2 from the existing automation alone.
