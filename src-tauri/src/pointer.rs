//! Cursor coordinates are used transiently inside our own window only.
//! No desktop pixels, button history, or positions outside the window are returned.
use std::sync::atomic::{AtomicBool, AtomicI8, Ordering};
use tauri::{Manager, State, WebviewWindow};

pub struct PointerPolicy {
    pixel: AtomicBool,
    held: AtomicBool,
    panel: AtomicBool,
    applied: AtomicI8,
}

impl Default for PointerPolicy {
    fn default() -> Self {
        Self {
            pixel: AtomicBool::new(false),
            held: AtomicBool::new(false),
            panel: AtomicBool::new(false),
            applied: AtomicI8::new(-1),
        }
    }
}

fn captures(pixel: bool, held: bool, panel: bool) -> bool {
    pixel || held || panel
}

fn refresh(window: &WebviewWindow) -> Result<(), String> {
    let target = window.clone();
    // Read the latest policy ON the main thread: a delayed transparent-pixel
    // response must never turn off a panel that has just opened.
    window
        .run_on_main_thread(move || {
            let state = target.state::<PointerPolicy>();
            let capture = captures(
                state.pixel.load(Ordering::Relaxed),
                state.held.load(Ordering::Relaxed),
                state.panel.load(Ordering::Relaxed),
            );
            if state.applied.load(Ordering::Relaxed) != i8::from(capture)
                && target.set_ignore_cursor_events(!capture).is_ok()
            {
                state.applied.store(i8::from(capture), Ordering::Relaxed);
            }
        })
        .map_err(|_| "pointer_window_unavailable".into())
}

pub fn panel(window: &WebviewWindow, open: bool) -> Result<(), String> {
    window
        .state::<PointerPolicy>()
        .panel
        .store(open, Ordering::Relaxed);
    refresh(window)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    client_x: f64,
    client_y: f64,
}

fn local_point(
    x: f64,
    y: f64,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    scale: f64,
) -> Option<Point> {
    if !scale.is_finite()
        || scale <= 0.0
        || !x.is_finite()
        || !y.is_finite()
        || x < left
        || y < top
        || x >= left + width
        || y >= top + height
    {
        return None;
    }
    Some(Point {
        client_x: (x - left) / scale,
        client_y: (y - top) / scale,
    })
}

#[tauri::command]
pub async fn pet_pointer_position(window: WebviewWindow) -> Result<Option<Point>, String> {
    let cursor = window
        .cursor_position()
        .map_err(|_| "pointer_unavailable")?;
    let origin = window.inner_position().map_err(|_| "pointer_unavailable")?;
    let size = window.inner_size().map_err(|_| "pointer_unavailable")?;
    let scale = window.scale_factor().map_err(|_| "pointer_unavailable")?;
    Ok(local_point(
        cursor.x,
        cursor.y,
        origin.x.into(),
        origin.y.into(),
        size.width.into(),
        size.height.into(),
        scale,
    ))
}

#[tauri::command]
pub async fn set_pet_pointer_capture(
    window: WebviewWindow,
    state: State<'_, PointerPolicy>,
    capture: bool,
) -> Result<(), String> {
    state.pixel.store(capture, Ordering::Relaxed);
    refresh(&window)
}

#[tauri::command]
pub async fn hold_pet_pointer(
    window: WebviewWindow,
    state: State<'_, PointerPolicy>,
    held: bool,
) -> Result<(), String> {
    state.held.store(held, Ordering::Relaxed);
    refresh(&window)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transparent_pixels_do_not_capture_but_panels_and_active_drags_do() {
        assert!(!captures(false, false, false));
        assert!(captures(true, false, false));
        assert!(captures(false, true, false));
        assert!(captures(false, false, true));
        assert!(!captures(false, false, false)); // closing a panel is not a permanent rectangle
    }

    #[test]
    fn cursor_mapping_respects_dpi_negative_monitors_and_excludes_other_windows() {
        let point = local_point(-1200.0, 300.0, -1600.0, 100.0, 880.0, 666.0, 2.0).unwrap();
        assert_eq!((point.client_x, point.client_y), (200.0, 100.0));
        for (x, y) in [(-1601.0, 100.0), (-720.0, 100.0), (-1200.0, 766.0)] {
            assert!(local_point(x, y, -1600.0, 100.0, 880.0, 666.0, 2.0).is_none());
        }
        assert!(local_point(1.0, 1.0, 0.0, 0.0, 100.0, 100.0, f64::NAN).is_none());
    }
}
