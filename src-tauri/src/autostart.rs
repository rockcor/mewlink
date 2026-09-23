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

#[cfg(test)]
mod tests {
    use super::windows_startup_command;
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
}
