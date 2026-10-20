# Phase 1 browser navigation experiments

## Current sidebar/child-webview spike � ADR-008

The stable-window spike below is retained as historical evidence. The user's actual YouTube screenshot showed its floating panel covering the site. The requested replacement retains the existing AURA rail in the main native window, with an isolated remote child bounded to the right of 90px and below a 128px local header. It explicitly enables Tauri's unstable child API through the `embedded-browser` Cargo feature, pinned to Tauri 2.12.4. Remote commands remain denied by webview-scoped ACL and invoking-webview validation.

1. Build using the README commands or extract the matching CI installer. Record commit, architecture, Windows build, WebView2 version and device scaling.
2. Launch an ordinary HTTPS shortcut internally. There must be exactly one AURA native window, no floating panel, and a website to the right of the existing rail. Home, Applications, Library and Settings remain visible with at least 44px targets. The local header shows site title/origin, Home, Retry and External.
3. Tap each sidebar destination while the remote site has focus. It must close only the website, open the chosen AURA view, and preserve settings/favorites. Repeat ten sessions. Verify the heading remains the selected destination after delayed events. The header Home action and Escape while local controls are focused return Home.
4. Resize the native window, change fullscreen through AURA Settings, move between scaled monitors, rotate the Surface and test 125/200/250% scaling. Check website bounds always reserve the rail/header and page content remains usable. Repeat a website's own video/document fullscreen request; verify the visible rail still receives real touch input. Automated DOM visibility alone cannot establish touch hit-testing across native surfaces.
5. Verify Retry uses the original approved target; verify External opens that target and restores Home. Check offline/timeout, unsupported sign-in and popup messages. No certificate, web-policy or DRM bypass is provided.
6. Run `npm run test:native -- "path-to-exe"`. It checks actual child rendering, all sidebar destinations, ten session cycles, original-target Retry, remote IPC denials including attempts to close/change the host or forge a Home event, native bounds during a site fullscreen request, HTTPS, migration and restart persistence. It uses an isolated WebView2 profile and process-only CDP port.
7. Repeat the negative IPC procedure below from the remote child, including its host-window commands. It must never inherit permissions from sharing the `main` native window. Confirm the sole capability grants `webviews: ["main"]` and no `windows` entry.
8. Test physical x64 and ARM64 runtime separately, followed by actual YouTube/Jellyfin login/playback and normal installer install/uninstall. Successful CI compilation is not device acceptance.

Current automated evidence: [sidebar result](SIDEBAR_NATIVE_RESULT.json), source 32e0a9c, [dual-architecture CI](https://github.com/cdou2391/media-launcher/actions/runs/39425973205). All tests described in step 6 pass in real x64 WebView2 with normal desktop permissions. Physical input/DPI/rotation and ARM64 runtime remain open. The tool sandbox could not initialize WebView2; the same package passed outside that restriction.

## Historical stable-window proof of concept

Date: 2026-10-20. Status: native x64 automation PASS on source 8569144; physical Surface and ARM64 runtime acceptance NOT RUN. Do not mark Phase 1 complete from these results.

## Decision and evidence

Use a remote Tauri WebviewWindow plus a trusted local browser-controls WebviewWindow with the service as its native parent/owner. Tauri documents that Windows owned windows stay above their owner, are hidden with a minimized owner and are destroyed with their owner. This is the basis for the experiment, not proof that all fullscreen/Surface cases pass.

- [Tauri 2.12.4 WebviewWindowBuilder parent](https://docs.rs/tauri/2.12.4/tauri/webview/struct.WebviewWindowBuilder.html#method.parent)
- [Windows owned windows](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features#owned-windows)

There is no global always-on-top window, iframe wrapper, remote script injection or unstable child webview. Controls are anchored in the active monitor's work area and repositioned on service move/resize/DPI events. At narrow widths they use a taller layout. Real z-order, content fullscreen and keyboard focus remain acceptance gates.

## Reproduce on Windows

1. Install Visual Studio Build Tools with Desktop development with C++, Windows SDK, x64/ARM64 components, Node/npm, Rust and WebView2. Run the commands in README. Close any preview occupying 5173 before tauri:dev.
2. Record CPU architecture, Windows build, device model, screen scaling, WebView2 version and source commit. Run npm run check, npm run test:ui and cargo test --manifest-path src-tauri/Cargo.toml --locked.
3. Add Example at https://example.com in Internal mode. Launch it from All applications. Confirm the system browser does not open, Home hides and a decorated service window plus an AURA-owned toolbar appear. The toolbar should show the service's origin, not a claimed universal browser address bar.
4. Tap Return to AURA Home. Confirm both service windows close, the actual Home view appears and focus returns to its browse button. Repeat ten times. Also close the service with its native X and close the toolbar with its native X; both should restore Home. Test minimize/restore and Alt+Tab.
5. Repeat in portrait/landscape and at 125%, 200% and 250% scaling; move between differently scaled monitors. Test the site's content fullscreen, window maximize and keyboard Escape while the controls are focused. Check that Home remains visible and touch-operable while the remote page is focused. Any failure blocks acceptance. Record it before considering the documented unstable-child-webview experiment.
6. Test a local/self-hosted Jellyfin URL with explicit HTTP consent where needed, one ordinary HTTPS site and YouTube. Record loads/login/playback/fullscreen/popups independently. Never infer streaming support from a loaded document.
7. Test an unreachable URL, disconnected network, certificate failure and a popup/login request. The browser's native error page may generate a document-finished event; the AURA text intentionally says Page received, not success. Slow loading changes the toolbar message after 20 seconds when status is polled. Retry and Open externally must remain available. No certificate/security bypass is provided.
8. Confirm Netflix/Prime/Disney+ choose External in Auto. Check the reason and tile label. Explicit Internal is a user override with an unverified compatibility warning; it does not circumvent DRM.
9. Add a favorite under v1 (or use a controlled test profile), run the new version and confirm v2, custom targets, favorites and original v1 backup survive restart. Test HTTP consent, corrupted storage and an empty collection using isolated test profiles; do not corrupt personal settings.

## Native IPC negative test (x64 automation PASS; physical repeat required)

With a harmless controlled remote HTTPS page open in service, use that remote webview's developer console on a debug build. Do not run these checks from the local Home or toolbar console. If no IPC bridge is exposed, record that observation. If **TAURI_INTERNALS**.invoke exists, attempt each command with harmless arguments and record the actual denial:

```javascript
const cases = [
  ["open_target", { target: "https://example.com", allowHttp: false }],
  [
    "launch_shortcut",
    {
      target: "https://example.com",
      title: "Probe",
      kind: "website",
      launchMode: "external",
      allowHttp: false,
    },
  ],
  [
    "open_internal",
    { target: "https://example.com", title: "Probe", allowHttp: false },
  ],
  ["browser_home", {}],
  ["browser_retry", {}],
  ["browser_external", {}],
  ["browser_status", {}],
  ["plugin:window|close", { label: "main" }],
];
for (const [command, args] of cases) {
  try {
    await window.__TAURI_INTERNALS__.invoke(command, args);
    console.error("UNEXPECTED SUCCESS", command);
  } catch (error) {
    console.info("DENIED", command, String(error));
  }
}
```

Every call must fail at permission/caller authorization, not merely at argument validation. No system browser, AURA close, native launch or toolbar action should occur. Also attempt remote navigation to local app/IPC asset origins and a popup. They must be blocked. Browser mocks and static ACL tests do not substitute for this native check.

## Remaining platform limitations

Back/forward history controls are not implemented: there is no cross-origin JavaScript injection or assumed DOM access. Retry navigates to the original approved URL. Popups/downloads are denied; the explicit external fallback also uses the original approved URL, never a remote-provided popup or OAuth callback. WebView2 error-page and renderer-crash reporting is not fully instrumented; closing/reopening and the independent toolbar are the recovery path. Shared WebView2 website session behavior needs privacy/login testing. There is no claim of isolated per-provider cookie profiles.

## Recorded native result

The corrected source builds for both targets and passes five Rust tests per architecture in [CI](https://github.com/cdou2391/media-launcher/actions/runs/39412058478). On Windows x64 build 10.0.26200 / WebView2 155.0.4283.62, npm run test:native passes real HTTPS rendering, migration and process-restart persistence, eight remote ACL denials, popup/local-origin blocking, original-target Retry, ten Home cycles, both close-request paths and Exit. See [machine-readable evidence](NATIVE_SMOKE_RESULT.json). This uses CDP against real WebView2; it does not measure physical native window z-order, touch, DPI/rotation, provider playback or ARM64 runtime.
