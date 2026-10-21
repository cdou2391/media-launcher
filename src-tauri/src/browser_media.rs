use tauri::{AppHandle, Webview};

// Native WebView2 controls only. No scripts, DOM access or remote IPC grants.
#[cfg(target_os = "windows")]
pub async fn mute(view: &Webview, value: bool) -> Result<bool, String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_8;
    use windows_core::{Interface, BOOL};
    let (sender, mut receiver) = tauri::async_runtime::channel(1);
    view.with_webview(move |platform| {
        let result = (|| unsafe {
            let core = platform.controller().CoreWebView2()?;
            let audio = core.cast::<ICoreWebView2_8>()?;
            let mut previous = BOOL::default();
            audio.IsMuted(&mut previous)?;
            audio.SetIsMuted(value)?;
            let mut confirmed = BOOL::default();
            audio.IsMuted(&mut confirmed)?;
            Ok::<_, windows_core::Error>((previous.as_bool(), confirmed.as_bool()))
        })()
        .map_err(|e| e.to_string());
        let _ = sender.try_send(result);
    })
    .map_err(|e| e.to_string())?;
    let (previous, confirmed) = receiver
        .recv()
        .await
        .ok_or("Website audio control is unavailable")??;
    if confirmed != value {
        return Err("The website's audio state could not be applied".into());
    }
    Ok(previous)
}

#[cfg(target_os = "windows")]
pub async fn resume(view: &Webview) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_3;
    use windows_core::Interface;
    let (sender, mut receiver) = tauri::async_runtime::channel(1);
    view.with_webview(move |platform| {
        let result = (|| unsafe {
            platform
                .controller()
                .CoreWebView2()?
                .cast::<ICoreWebView2_3>()?
                .Resume()
        })()
        .map_err(|e| e.to_string());
        let _ = sender.try_send(result);
    })
    .map_err(|e| e.to_string())?;
    receiver.recv().await.ok_or("Website could not resume")?
}

#[cfg(target_os = "windows")]
pub fn suspend(view: &Webview, app: &AppHandle, id: u64, generation: u64) {
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::ICoreWebView2_3, TrySuspendCompletedHandler,
    };
    use windows_core::Interface;
    let app = app.clone();
    // This is best effort and never blocks switching on a suspend callback.
    // Muting/hiding succeeded first; failure means "Kept open", not "Sleeping".
    let _ = view.with_webview(move |platform| {
        let _ = (|| unsafe {
            platform
                .controller()
                .CoreWebView2()?
                .cast::<ICoreWebView2_3>()?
                .TrySuspend(&TrySuspendCompletedHandler::create(Box::new(
                    move |error, suspended| {
                        crate::browser::suspend_completed(
                            &app,
                            id,
                            generation,
                            error.is_ok() && suspended,
                        );
                        Ok(())
                    },
                )))
        })();
    });
}

#[cfg(not(target_os = "windows"))]
pub async fn mute(_view: &Webview, _value: bool) -> Result<bool, String> {
    Err("Keeping background apps requires the Windows build".into())
}
#[cfg(not(target_os = "windows"))]
pub async fn resume(_view: &Webview) -> Result<(), String> {
    Ok(())
}
#[cfg(not(target_os = "windows"))]
pub fn suspend(_view: &Webview, _app: &AppHandle, _id: u64, _generation: u64) {}
