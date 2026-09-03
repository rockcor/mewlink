use serde::Serialize;
use tauri::{Manager, PhysicalPosition};

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct PresenceSignal {
    idle_seconds: u64,
    locked: bool,
    app_class: &'static str,
}

#[cfg(target_os = "macos")]
mod platform {
    use super::PresenceSignal;
    use std::ffi::{c_char, c_void};

    const COMBINED_SESSION_STATE: i32 = 0;
    const ANY_INPUT_EVENT_TYPE: u32 = u32::MAX;
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
            app_class: "unknown",
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
            assert_eq!(signal.app_class, "unknown");
            assert!(signal.idle_seconds < u64::MAX);
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::PresenceSignal;
    use std::mem::size_of;
    use windows_sys::Win32::System::StationsAndDesktops::{
        CloseDesktop, OpenInputDesktop, SwitchDesktop, DESKTOP_SWITCHDESKTOP,
    };
    use windows_sys::Win32::System::SystemInformation::GetTickCount64;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    pub(super) fn sample() -> PresenceSignal {
        PresenceSignal {
            idle_seconds: idle_seconds(),
            locked: session_is_locked(),
            app_class: "unknown",
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
        }
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
