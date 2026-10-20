use crate::security;

pub fn open_external(target: &str, allow_http: bool) -> Result<(), String> {
    let value = if security::local_target(target) {
        target.to_owned()
    } else {
        security::website_url(target, allow_http)?.to_string()
    };
    shell_open(&value)
}

#[cfg(target_os = "windows")]
fn shell_open(target: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};
    let action: Vec<u16> = "open\0".encode_utf16().collect();
    let wide: Vec<u16> = std::ffi::OsStr::new(target)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            action.as_ptr(),
            wide.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if (result as isize) <= 32 {
        return Err(format!(
            "Windows could not open this shortcut (error {})",
            result as isize
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn shell_open(_target: &str) -> Result<(), String> {
    Err("AURA desktop launching is supported on Windows only".into())
}
