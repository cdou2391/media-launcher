fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "open_target",
            "launch_shortcut",
            "open_internal",
            "browser_status",
            "browser_home",
            "browser_reveal",
            "browser_retry",
            "browser_external",
            "usage_foreground",
            "app_fullscreen",
        ]),
    ))
    .expect("Failed to build AURA permissions");
}
