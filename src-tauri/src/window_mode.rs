use crate::security;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, Webview};

// Only trusted AURA controls choose the host window's mode. A remote HTML
// fullscreen element fills its child view, not the application's window.
pub struct WindowMode(pub AtomicBool);

#[tauri::command]
pub fn app_fullscreen(window: Webview, app: AppHandle, value: bool) -> Result<(), String> {
    security::authorize(&window, false)?;
    let main = app.get_window("main").ok_or("AURA Home is unavailable")?;
    main.set_fullscreen(value).map_err(|e| e.to_string())?;
    app.state::<WindowMode>().0.store(value, Ordering::SeqCst);
    Ok(())
}

#[cfg(target_os = "windows")]
pub async fn isolate_site_fullscreen(service: &Webview, app: &AppHandle) -> Result<(), String> {
    let app = app.clone();
    let (sender, mut receiver) = tauri::async_runtime::channel(1);
    service
        .with_webview(move |platform| {
            let result = (|| {
                // Tauri 2.12.4 registers its own handler first, queuing a host
                // SetFullscreen for every HTML fullscreen change. Queue our
                // reconciliation after it, via a worker (main-thread dispatch
                // otherwise executes immediately, before Tauri's queued change).
                let core = unsafe { platform.controller().CoreWebView2() }
                    .map_err(|e| e.to_string())?;
                let mut token = 0;
                unsafe {
                    core.add_ContainsFullScreenElementChanged(
                        &webview2_com::ContainsFullScreenElementChangedEventHandler::create(
                            Box::new(move |_, _| {
                                let queued_app = app.clone();
                                tauri::async_runtime::spawn(async move {
                                    let host_app = queued_app.clone();
                                    let _ = queued_app.run_on_main_thread(move || {
                                        if let Some(main) = host_app.get_window("main") {
                                            let desired = host_app
                                                .state::<WindowMode>()
                                                .0
                                                .load(Ordering::SeqCst);
                                            if main.is_fullscreen().ok() != Some(desired) {
                                                if let Err(error) = main.set_fullscreen(desired) {
                                                    eprintln!("AURA fullscreen restoration failed: {error}");
                                                }
                                            }
                                        }
                                    });
                                });
                                Ok(())
                            }),
                        ),
                        &mut token,
                    )
                }
                .map_err(|e| e.to_string())
                // The handler is owned by this CoreWebView2 and released on
                // child close. A late callback reads the latest trusted mode.
            })();
            let _ = sender.try_send(result);
        })
        .map_err(|e| e.to_string())?;
    receiver
        .recv()
        .await
        .ok_or("Website fullscreen isolation could not initialize")?
}
