#[cfg(any(target_os = "windows", test))]
fn windows_startup_command(executable: &std::path::Path) -> Result<String, String> {
    let path = executable.to_str().ok_or("Invalid executable path")?;
    if path.contains('"') || path.is_empty() {
        return Err("Invalid executable path".into());
    }
    Ok(format!("\"{path}\""))
}

#[tauri::command]
pub fn enable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::{enums::HKEY_CURRENT_USER, enums::REG_BINARY, RegKey, RegValue};
        // auto-launch 0.5.0 writes an unquoted executable path. Quote it here
        // so installations under Program Files / names with spaces launch
        // the right binary. Query and disable still use the official plugin.
        let command =
            windows_startup_command(&std::env::current_exe().map_err(|error| error.to_string())?)?;
        let user = RegKey::predef(HKEY_CURRENT_USER);
        let name = &app.package_info().name;
        let (run, _) = user
            .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
            .map_err(|error| error.to_string())?;
        run.set_value(name, &command)
            .map_err(|error| error.to_string())?;
        let (approved, _) = user
            .create_subkey(
                r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run",
            )
            .map_err(|error| error.to_string())?;
        approved
            .set_raw_value(
                name,
                &RegValue {
                    vtype: REG_BINARY,
                    bytes: vec![2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                },
            )
            .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch().enable().map_err(|error| error.to_string())
    }
}

/// Whether this executable is an installed copy that launch at login may
/// point to: not a development build, a mounted disk image or a copy macOS
/// runs from a temporary translocation folder.
fn installed_location(executable: &std::path::Path) -> bool {
    installed_path(
        &executable.to_string_lossy(),
        cfg!(debug_assertions),
        cfg!(target_os = "macos"),
    )
}

fn installed_path(path: &str, debug_build: bool, macos: bool) -> bool {
    if debug_build {
        return false;
    }
    if macos {
        return path.contains(".app/Contents/MacOS/")
            && !path.contains("/AppTranslocation/")
            && !path.starts_with("/Volumes/");
    }
    true
}

/// Launch at login remembers where the app was when it was turned on. If it is
/// on, point it at this copy again (after the app was moved, say). It is never
/// turned on here: if it is off, or turned off in System Settings / Task
/// Manager, nothing changes.
pub fn refresh_autostart(app: &tauri::AppHandle) {
    use tauri_plugin_autostart::ManagerExt;
    let Ok(executable) = std::env::current_exe() else {
        return;
    };
    if !installed_location(&executable) || !app.autolaunch().is_enabled().unwrap_or(false) {
        return;
    }
    let _ = enable_autostart(app.clone());
}

#[cfg(test)]
mod tests {
    use super::{installed_location, installed_path, windows_startup_command};
    use std::path::Path;

    #[test]
    fn startup_command_quotes_spaces_and_preserves_unicode() {
        for path in [
            r"C:\Program Files\MewLink\mewlink.exe",
            r"C:\Users\小 明\AppData\Local\MewLink\mewlink.exe",
        ] {
            assert_eq!(
                windows_startup_command(Path::new(path)).unwrap(),
                format!("\"{path}\"")
            );
        }
        assert!(windows_startup_command(Path::new("bad\"path.exe")).is_err());
        assert!(windows_startup_command(Path::new("")).is_err());
    }

    #[test]
    fn launch_at_login_only_follows_an_installed_copy() {
        let app = "/Applications/MewLink.app/Contents/MacOS/mewlink";
        assert!(installed_path(app, false, true));
        assert!(installed_path(
            "/Users/me/Applications/MewLink.app/Contents/MacOS/mewlink",
            false,
            true
        ));
        // `tauri dev`, the disk image, a translocated copy, a bare binary: leave it alone.
        assert!(!installed_path(app, true, true));
        assert!(!installed_path(
            "/Volumes/MewLink/MewLink.app/Contents/MacOS/mewlink",
            false,
            true
        ));
        assert!(!installed_path(
            "/private/var/folders/x/AppTranslocation/1/d/MewLink.app/Contents/MacOS/mewlink",
            false,
            true
        ));
        assert!(!installed_path(
            "/Users/me/src/mewlink/target/release/mewlink",
            false,
            true
        ));
        assert!(installed_path(
            r"C:\Users\me\AppData\Local\MewLink\mewlink.exe",
            false,
            false
        ));
        // This test build is a debug build.
        assert!(!installed_location(std::path::Path::new(app)));
    }
}
