use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

pub struct ResourceState {
    pub low_memory: AtomicBool,
    pub input: Mutex<super::InputSignal>,
}

impl Default for ResourceState {
    fn default() -> Self {
        Self {
            low_memory: AtomicBool::new(false),
            input: Mutex::new(super::platform::input_sample()),
        }
    }
}

pub fn sample_delay(low_memory: bool, quiet_ms: u128) -> Duration {
    Duration::from_millis(if low_memory {
        250
    } else if quiet_ms >= 2_000 {
        50
    } else {
        16
    })
}

pub fn start_input_monitor(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut changed_at = Instant::now();
        loop {
            let state = app.state::<ResourceState>();
            let next = super::platform::input_sample();
            let changed = {
                let mut current = state
                    .input
                    .lock()
                    .unwrap_or_else(|error| error.into_inner());
                let changed = current.keyboard_sequence != next.keyboard_sequence
                    || current.pointer_sequence != next.pointer_sequence
                    || current.pointer_click_sequence != next.pointer_click_sequence;
                *current = next.clone();
                changed
            };
            if changed {
                changed_at = Instant::now();
                let _ = app.emit_to("main", "mewlink-input", next);
            }
            std::thread::sleep(sample_delay(
                state.low_memory.load(Ordering::Relaxed),
                changed_at.elapsed().as_millis(),
            ));
        }
    });
}

#[tauri::command]
pub async fn set_low_memory_mode(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ResourceState>,
    low_memory: bool,
) -> Result<(), String> {
    state.low_memory.store(low_memory, Ordering::Relaxed);
    #[cfg(target_os = "windows")]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        };
        use windows_core::Interface;
        let (sender, mut receiver) = tauri::async_runtime::channel(1);
        window
            .with_webview(move |webview| {
                let result = (|| unsafe {
                    let core = webview.controller().CoreWebView2()?;
                    let advanced = core.cast::<ICoreWebView2_19>()?;
                    advanced.SetMemoryUsageTargetLevel(if low_memory {
                        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
                    } else {
                        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
                    })
                })()
                .map_err(|error: windows_core::Error| error.to_string());
                let _ = sender.try_send(result);
            })
            .map_err(|error| error.to_string())?;
        receiver
            .recv()
            .await
            .ok_or("WebView memory request cancelled")?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn active_input_stays_responsive_and_quiet_input_backs_off() {
        assert_eq!(sample_delay(false, 0).as_millis(), 16);
        assert_eq!(sample_delay(false, 2_000).as_millis(), 50);
        assert_eq!(sample_delay(true, 0).as_millis(), 250);
    }
}
