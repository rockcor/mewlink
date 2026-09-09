// Read UI language preferences locally. No locale data is sent to the relay.
#[tauri::command]
pub fn system_languages() -> Vec<String> {
    preferred_languages()
}

#[cfg(target_os = "macos")]
fn preferred_languages() -> Vec<String> {
    objc2_foundation::NSLocale::preferredLanguages()
        .iter()
        .map(|language| language.to_string())
        .collect()
}

#[cfg(target_os = "windows")]
fn preferred_languages() -> Vec<String> {
    use windows_sys::Win32::Globalization::{GetUserPreferredUILanguages, MUI_LANGUAGE_NAME};
    let mut count = 0;
    let mut length = 0;
    // Windows returns a double-NUL-terminated UTF-16 list in preference order.
    unsafe {
        if GetUserPreferredUILanguages(
            MUI_LANGUAGE_NAME,
            &mut count,
            std::ptr::null_mut(),
            &mut length,
        ) == 0
            || length == 0
            || length > 65_536
        {
            return Vec::new();
        }
        let mut buffer = vec![0u16; length as usize];
        if GetUserPreferredUILanguages(
            MUI_LANGUAGE_NAME,
            &mut count,
            buffer.as_mut_ptr(),
            &mut length,
        ) == 0
        {
            return Vec::new();
        }
        buffer
            .split(|value| *value == 0)
            .take_while(|locale| !locale.is_empty())
            .map(String::from_utf16_lossy)
            .collect()
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn preferred_languages() -> Vec<String> {
    Vec::new()
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    #[test]
    fn reads_native_preferred_ui_languages() {
        let locales = super::system_languages();
        assert!(!locales.is_empty());
        assert!(locales.iter().all(|locale| !locale.is_empty()));
    }
}
