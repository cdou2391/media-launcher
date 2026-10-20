mod browser;
mod launch;
mod policy;
mod security;
mod usage;

use tauri::{webview::NewWindowResponse, Manager, Webview, WebviewWindowBuilder};

#[tauri::command]
fn open_target(window: Webview, target: String, allow_http: bool) -> Result<(), String> {
    security::authorize(&window, true)?;
    launch::open_external(&target, allow_http)
}

#[tauri::command]
async fn launch_shortcut(
    window: Webview,
    app: tauri::AppHandle,
    target: String,
    title: String,
    kind: String,
    launch_mode: String,
    allow_http: bool,
    shortcut_id: Option<String>,
) -> Result<policy::Route, String> {
    security::authorize(&window, true)?;
    let route = policy::route(&target, &kind, &launch_mode, allow_http)?;
    if route.mode == "internal" {
        browser::open_internal(window, app, target, title, allow_http, shortcut_id).await?;
    } else {
        launch::open_external(&target, allow_http)?;
    }
    Ok(route)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(browser::BrowserState::default())
        .setup(|app| {
            WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(|url| security::trusted_page("main", url))
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(
                    event,
                    tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }
                )
            {
                let _ = browser::resize_service(window.app_handle());
            }
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_target,
            launch_shortcut,
            browser::open_internal,
            browser::browser_status,
            browser::browser_home,
            browser::browser_retry,
            browser::browser_external,
            usage::usage_foreground
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start AURA Home Media");
}
