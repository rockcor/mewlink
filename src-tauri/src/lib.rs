use serde::Serialize;
use tauri::{Manager, PhysicalPosition};

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct PresenceSignal {
    idle_seconds: u64,
    locked: bool,
    app_class: &'static str,
    input_kind: &'static str,
}

fn classify_foreground_app(value: &str) -> &'static str {
    let app = value.to_ascii_lowercase();
    let contains = |candidates: &[&str]| candidates.iter().any(|candidate| app.contains(candidate));

    if contains(&[
        "zoom",
        "microsoft.teams",
        "ms-teams",
        "webex",
        "facetime",
        "gotomeeting",
    ]) {
        "meeting"
    } else if contains(&["vlc", "quicktime", "iina", "plex", "infuse", "mpv"]) {
        "media"
    } else if contains(&[
        "vscode",
        "visual studio code",
        "cursor",
        "codex",
        "xcode",
        "jetbrains",
        "intellij",
        "pycharm",
        "webstorm",
        "android studio",
        "zed",
        "sublime",
        "terminal",
        "iterm",
        "warp",
    ]) {
        "editor"
    } else if contains(&[
        "preview",
        "acrobat",
        "pdf",
        "books",
        "microsoft.word",
        "microsoft.excel",
        "microsoft.powerpoint",
        "pages",
        "numbers",
        "keynote",
        "obsidian",
        "notion",
    ]) {
        "reader"
    } else if contains(&[
        "chrome", "safari", "firefox", "msedge", "edge", "arc", "brave", "opera",
    ]) {
        "browser"
    } else {
        "unknown"
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{classify_foreground_app, PresenceSignal};
    use objc2_app_kit::NSWorkspace;
    use std::ffi::{c_char, c_void};

    const COMBINED_SESSION_STATE: i32 = 0;
    const ANY_INPUT_EVENT_TYPE: u32 = u32::MAX;
    const LEFT_MOUSE_DOWN: u32 = 1;
    const RIGHT_MOUSE_DOWN: u32 = 3;
    const MOUSE_MOVED: u32 = 5;
    const LEFT_MOUSE_DRAGGED: u32 = 6;
    const RIGHT_MOUSE_DRAGGED: u32 = 7;
    const KEY_DOWN: u32 = 10;
    const KEY_UP: u32 = 11;
    const FLAGS_CHANGED: u32 = 12;
    const SCROLL_WHEEL: u32 = 22;
    const OTHER_MOUSE_DOWN: u32 = 25;
    const OTHER_MOUSE_DRAGGED: u32 = 27;
    const UTF8_ENCODING: u32 = 0x0800_0100;
    const LOCK_KEY: &[u8] = b"CGSSessionScreenIsLocked\0";

    #[allow(non_snake_case)]
    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state_id: i32, event_type: u32) -> f64;
        fn CGSessionCopyCurrentDictionary() -> *const c_void;
    }

    #[allow(non_snake_case)]
    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFStringCreateWithCString(
            allocator: *const c_void,
            value: *const c_char,
            encoding: u32,
        ) -> *const c_void;
        fn CFDictionaryGetValue(dictionary: *const c_void, key: *const c_void) -> *const c_void;
        fn CFBooleanGetTypeID() -> usize;
        fn CFBooleanGetValue(value: *const c_void) -> u8;
        fn CFGetTypeID(value: *const c_void) -> usize;
        fn CFRelease(value: *const c_void);
    }

    pub(super) fn sample() -> PresenceSignal {
        // Reads only the elapsed duration since input, never the input itself.
        let idle = unsafe {
            CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION_STATE, ANY_INPUT_EVENT_TYPE)
        };
        PresenceSignal {
            idle_seconds: finite_seconds(idle),
            locked: session_is_locked(),
            app_class: foreground_app_class(),
            input_kind: recent_input_kind(),
        }
    }

    fn foreground_app_class() -> &'static str {
        let workspace = NSWorkspace::sharedWorkspace();
        let Some(application) = workspace.frontmostApplication() else {
            return "unknown";
        };
        let identifier = application
            .bundleIdentifier()
            .map(|value| value.to_string())
            .unwrap_or_default();
        let name = application
            .localizedName()
            .map(|value| value.to_string())
            .unwrap_or_default();
        classify_foreground_app(&format!("{identifier} {name}"))
    }

    fn seconds_since(event_type: u32) -> f64 {
        unsafe { CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION_STATE, event_type) }
    }

    fn most_recent(events: &[u32]) -> f64 {
        events
            .iter()
            .map(|event| seconds_since(*event))
            .filter(|seconds| seconds.is_finite() && *seconds >= 0.0)
            .fold(f64::INFINITY, f64::min)
    }

    fn recent_input_kind() -> &'static str {
        // Only event timing is read. Key values, pointer coordinates, and gesture content are not.
        let keyboard = most_recent(&[KEY_DOWN, KEY_UP, FLAGS_CHANGED]);
        let pointer = most_recent(&[
            LEFT_MOUSE_DOWN,
            RIGHT_MOUSE_DOWN,
            MOUSE_MOVED,
            LEFT_MOUSE_DRAGGED,
            RIGHT_MOUSE_DRAGGED,
            SCROLL_WHEEL,
            OTHER_MOUSE_DOWN,
            OTHER_MOUSE_DRAGGED,
        ]);
        if keyboard <= 1.5 && keyboard <= pointer {
            "keyboard"
        } else if pointer <= 1.5 {
            "pointer"
        } else {
            "none"
        }
    }

    fn finite_seconds(seconds: f64) -> u64 {
        if seconds.is_finite() && seconds > 0.0 {
            seconds.min(u64::MAX as f64) as u64
        } else {
            0
        }
    }

    fn session_is_locked() -> bool {
        // The session dictionary contains state flags only. No window titles,
        // application names, URLs, pixels, or input content are accessed.
        unsafe {
            let dictionary = CGSessionCopyCurrentDictionary();
            if dictionary.is_null() {
                return true;
            }

            let key = CFStringCreateWithCString(
                std::ptr::null(),
                LOCK_KEY.as_ptr().cast(),
                UTF8_ENCODING,
            );
            if key.is_null() {
                CFRelease(dictionary);
                return true;
            }

            let value = CFDictionaryGetValue(dictionary, key);
            let locked = !value.is_null()
                && CFGetTypeID(value) == CFBooleanGetTypeID()
                && CFBooleanGetValue(value) != 0;
            CFRelease(key);
            CFRelease(dictionary);
            locked
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn invalid_idle_values_are_private_safe_zeroes() {
            assert_eq!(finite_seconds(f64::NAN), 0);
            assert_eq!(finite_seconds(-1.0), 0);
            assert_eq!(finite_seconds(2.9), 2);
        }

        #[test]
        fn reads_a_real_session_signal() {
            let signal = sample();
            assert!(
                ["editor", "reader", "meeting", "media", "browser", "unknown"]
                    .contains(&signal.app_class)
            );
            assert!(["keyboard", "pointer", "none"].contains(&signal.input_kind));
            assert!(signal.idle_seconds < u64::MAX);
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{classify_foreground_app, PresenceSignal};
    use std::mem::size_of;
    use std::sync::atomic::{AtomicU64, Ordering};
    use windows_sys::Win32::Foundation::{CloseHandle, POINT};
    use windows_sys::Win32::System::StationsAndDesktops::{
        CloseDesktop, OpenInputDesktop, SwitchDesktop, DESKTOP_SWITCHDESKTOP,
    };
    use windows_sys::Win32::System::SystemInformation::GetTickCount64;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetForegroundWindow, GetWindowThreadProcessId,
    };

    static LAST_CURSOR: AtomicU64 = AtomicU64::new(u64::MAX);
    static LAST_IDLE: AtomicU64 = AtomicU64::new(u64::MAX);

    pub(super) fn sample() -> PresenceSignal {
        let idle_seconds = idle_seconds();
        PresenceSignal {
            idle_seconds,
            locked: session_is_locked(),
            app_class: foreground_app_class(),
            input_kind: recent_input_kind(idle_seconds),
        }
    }

    fn foreground_app_class() -> &'static str {
        unsafe {
            let window = GetForegroundWindow();
            if window.is_null() {
                return "unknown";
            }
            let mut process_id = 0;
            GetWindowThreadProcessId(window, &mut process_id);
            if process_id == 0 {
                return "unknown";
            }
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
            if process.is_null() {
                return "unknown";
            }
            let mut buffer = [0_u16; 1024];
            let mut length = buffer.len() as u32;
            let ok = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut length) != 0;
            CloseHandle(process);
            if !ok {
                return "unknown";
            }
            classify_foreground_app(&String::from_utf16_lossy(&buffer[..length as usize]))
        }
    }

    fn recent_input_kind(idle_seconds: u64) -> &'static str {
        if idle_seconds > 2 {
            return "none";
        }
        let mut cursor = POINT { x: 0, y: 0 };
        let packed_cursor = if unsafe { GetCursorPos(&mut cursor) } != 0 {
            ((cursor.x as u32 as u64) << 32) | cursor.y as u32 as u64
        } else {
            u64::MAX
        };
        let previous_cursor = LAST_CURSOR.swap(packed_cursor, Ordering::Relaxed);
        let previous_idle = LAST_IDLE.swap(idle_seconds, Ordering::Relaxed);
        if packed_cursor != u64::MAX
            && previous_cursor != u64::MAX
            && packed_cursor != previous_cursor
        {
            "pointer"
        } else if previous_idle != u64::MAX && idle_seconds < previous_idle {
            // A fresh non-pointer event is treated as keyboard/trackpad activity; content is unknown.
            "keyboard"
        } else {
            "none"
        }
    }

    fn idle_seconds() -> u64 {
        let mut last_input = LASTINPUTINFO {
            cbSize: size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if unsafe { GetLastInputInfo(&mut last_input) } == 0 {
            return 0;
        }

        let now = unsafe { GetTickCount64() } as u32;
        u64::from(now.wrapping_sub(last_input.dwTime)) / 1_000
    }

    fn session_is_locked() -> bool {
        unsafe {
            let desktop = OpenInputDesktop(0, 0, DESKTOP_SWITCHDESKTOP);
            if desktop.is_null() {
                return true;
            }
            let unlocked = SwitchDesktop(desktop) != 0;
            CloseDesktop(desktop);
            !unlocked
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use super::PresenceSignal;

    pub(super) fn sample() -> PresenceSignal {
        PresenceSignal {
            idle_seconds: 0,
            locked: false,
            app_class: "unknown",
            input_kind: "none",
        }
    }
}

#[cfg(test)]
mod classification_tests {
    use super::classify_foreground_app;

    #[test]
    fn classifies_white_collar_apps_without_exposing_names() {
        assert_eq!(classify_foreground_app("com.microsoft.VSCode"), "editor");
        assert_eq!(classify_foreground_app("us.zoom.xos"), "meeting");
        assert_eq!(
            classify_foreground_app("com.apple.QuickTimePlayerX"),
            "media"
        );
        assert_eq!(classify_foreground_app("com.apple.Safari"), "browser");
        assert_eq!(classify_foreground_app("com.apple.Preview"), "reader");
    }
}

// Only coarse presence data crosses the command boundary.
#[tauri::command]
fn presence_signal() -> PresenceSignal {
    platform::sample()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![presence_signal])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Some(monitor) = window.current_monitor()? {
                    let work_area = monitor.work_area();
                    let window_size = window.outer_size()?;
                    let margin = 16;
                    let right = work_area.position.x + work_area.size.width as i32;
                    let bottom = work_area.position.y + work_area.size.height as i32;
                    let x = (right - window_size.width as i32 - margin).max(work_area.position.x);
                    let y = (bottom - window_size.height as i32 - margin).max(work_area.position.y);
                    window.set_position(PhysicalPosition::new(x, y))?;
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MewLink");
}
