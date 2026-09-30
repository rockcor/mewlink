//! Count message kinds only: never inspect keyboard codes, text or coordinates.
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Once,
};
use windows_sys::Win32::{
    Foundation::{LPARAM, LRESULT, WPARAM},
    System::{LibraryLoader::GetModuleHandleW, SystemInformation::GetTickCount64},
    UI::WindowsAndMessaging::*,
};

static START: Once = Once::new();
static KEYS: AtomicU64 = AtomicU64::new(0);
static POINTER: AtomicU64 = AtomicU64::new(0);
static CLICKS: AtomicU64 = AtomicU64::new(0);
static KEY_AT: AtomicU64 = AtomicU64::new(0);
static POINTER_AT: AtomicU64 = AtomicU64::new(0);

unsafe extern "system" fn keyboard(code: i32, message: WPARAM, data: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 && matches!(message as u32, WM_KEYDOWN | WM_SYSKEYDOWN) {
        KEYS.fetch_add(1, Ordering::Relaxed);
        KEY_AT.store(unsafe { GetTickCount64() }, Ordering::Relaxed);
    }
    unsafe { CallNextHookEx(std::ptr::null_mut(), code, message, data) }
}
unsafe extern "system" fn pointer(code: i32, message: WPARAM, data: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let message = message as u32;
        if matches!(
            message,
            WM_MOUSEMOVE
                | WM_MOUSEWHEEL
                | WM_MOUSEHWHEEL
                | WM_LBUTTONDOWN
                | WM_RBUTTONDOWN
                | WM_MBUTTONDOWN
                | WM_XBUTTONDOWN
        ) {
            POINTER.fetch_add(1, Ordering::Relaxed);
            POINTER_AT.store(unsafe { GetTickCount64() }, Ordering::Relaxed);
            if matches!(
                message,
                WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN | WM_XBUTTONDOWN
            ) {
                CLICKS.fetch_add(1, Ordering::Relaxed);
            }
        }
    }
    unsafe { CallNextHookEx(std::ptr::null_mut(), code, message, data) }
}

pub fn sample() -> super::InputSignal {
    START.call_once(|| {
        std::thread::spawn(|| unsafe {
            let module = GetModuleHandleW(std::ptr::null());
            let keys = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard), module, 0);
            let mouse = SetWindowsHookExW(WH_MOUSE_LL, Some(pointer), module, 0);
            let mut message: MSG = std::mem::zeroed();
            while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            if !keys.is_null() {
                UnhookWindowsHookEx(keys);
            }
            if !mouse.is_null() {
                UnhookWindowsHookEx(mouse);
            }
        });
    });
    let key_at = KEY_AT.load(Ordering::Relaxed);
    let pointer_at = POINTER_AT.load(Ordering::Relaxed);
    let now = unsafe { GetTickCount64() };
    super::InputSignal {
        keyboard_sequence: KEYS.load(Ordering::Relaxed),
        pointer_sequence: POINTER.load(Ordering::Relaxed),
        pointer_click_sequence: CLICKS.load(Ordering::Relaxed),
        recent_kind: if now.saturating_sub(key_at.max(pointer_at)) > 2000 {
            "none"
        } else if pointer_at > key_at {
            "pointer"
        } else {
            "keyboard"
        },
    }
}
