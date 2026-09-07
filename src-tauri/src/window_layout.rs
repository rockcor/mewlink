use std::sync::Mutex;
use tauri::{PhysicalPosition, PhysicalSize, State, WebviewWindow};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Rect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

impl Rect {
    fn fit(self, area: Self, margin: u32) -> Self {
        let margin = margin.min(area.width / 4).min(area.height / 4);
        let width = self.width.min(area.width - margin * 2).max(1);
        let height = self.height.min(area.height - margin * 2).max(1);
        Self {
            x: self.x.clamp(
                area.x + margin as i32,
                area.x + (area.width - margin - width) as i32,
            ),
            y: self.y.clamp(
                area.y + margin as i32,
                area.y + (area.height - margin - height) as i32,
            ),
            width,
            height,
        }
    }
}

#[derive(Default)]
pub struct DesktopLayout(Mutex<Option<Rect>>);

fn bounds(window: &WebviewWindow) -> Result<Rect, String> {
    let p = window.outer_position().map_err(|e| e.to_string())?;
    let s = window.outer_size().map_err(|e| e.to_string())?;
    Ok(Rect {
        x: p.x,
        y: p.y,
        width: s.width,
        height: s.height,
    })
}

fn monitor_area(window: &WebviewWindow, rect: Rect) -> Result<(Rect, f64), String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    // Pick the closest work area to the pet's center, including negative-origin displays.
    let cx = rect.x as i64 + rect.width as i64 / 2;
    let cy = rect.y as i64 + rect.height as i64 / 2;
    let monitor = monitors
        .iter()
        .min_by_key(|monitor| {
            let a = monitor.work_area();
            let dx = cx
                - cx.clamp(
                    a.position.x as i64,
                    a.position.x as i64 + a.size.width as i64,
                );
            let dy = cy
                - cy.clamp(
                    a.position.y as i64,
                    a.position.y as i64 + a.size.height as i64,
                );
            dx * dx + dy * dy
        })
        .ok_or("No display available")?;
    let a = monitor.work_area();
    Ok((
        Rect {
            x: a.position.x,
            y: a.position.y,
            width: a.size.width,
            height: a.size.height,
        },
        monitor.scale_factor(),
    ))
}

fn place(window: &WebviewWindow, rect: Rect, resizable: bool) -> Result<(), String> {
    window
        .set_min_size(None::<PhysicalSize<u32>>)
        .map_err(|e| e.to_string())?;
    window
        .set_max_size(None::<PhysicalSize<u32>>)
        .map_err(|e| e.to_string())?;
    window.set_resizable(resizable).map_err(|e| e.to_string())?;
    window
        .set_size(PhysicalSize::new(rect.width, rect.height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(rect.x, rect.y))
        .map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let minimum = if resizable {
        PhysicalSize::new(
            rect.width.min((400.0 * scale) as u32),
            rect.height.min((360.0 * scale) as u32),
        )
    } else {
        PhysicalSize::new(rect.width, rect.height)
    };
    window
        .set_min_size(Some(minimum))
        .map_err(|e| e.to_string())?;
    if !resizable {
        window
            .set_max_size(Some(PhysicalSize::new(rect.width, rect.height)))
            .map_err(|e| e.to_string())?;
    }
    // Changing the macOS resize style can move first-responder status away from
    // WKWebView. Restore both window and webview focus so Escape works immediately.
    window.set_focus().map_err(|e| e.to_string())?;
    window.as_ref().set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_panel_open(
    window: WebviewWindow,
    state: State<'_, DesktopLayout>,
    open: bool,
) -> Result<(), String> {
    let mut saved = state.0.lock().map_err(|e| e.to_string())?;
    if open {
        if saved.is_some() {
            return Ok(());
        }
        let pet = bounds(&window)?;
        let (area, scale) = monitor_area(&window, pet)?;
        let panel = Rect {
            width: (540.0 * scale) as u32,
            height: (640.0 * scale) as u32,
            ..pet
        }
        .fit(area, (12.0 * scale) as u32);
        // Remember the pet, not the expanded panel, even while the panel is being dragged.
        *saved = Some(pet);
        if let Err(error) = place(&window, panel, true) {
            let _ = place(&window, pet, false);
            *saved = None;
            return Err(error);
        }
    } else if let Some(pet) = *saved {
        let (area, _) = monitor_area(&window, pet)?;
        place(&window, pet.fit(area, 0), false)?;
        *saved = None;
    }
    Ok(())
}

#[tauri::command]
pub fn pet_window_position(
    window: WebviewWindow,
    state: State<'_, DesktopLayout>,
) -> Result<PhysicalPosition<i32>, String> {
    let saved = state.0.lock().map_err(|e| e.to_string())?;
    let rect = match *saved {
        Some(rect) => rect,
        None => bounds(&window)?,
    };
    Ok(PhysicalPosition::new(rect.x, rect.y))
}

#[tauri::command]
pub fn restore_pet_position(
    window: WebviewWindow,
    state: State<'_, DesktopLayout>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    let saved = state.0.lock().map_err(|e| e.to_string())?;
    if saved.is_some() {
        return Ok(());
    }
    let rect = Rect {
        x,
        y,
        ..bounds(&window)?
    };
    let (area, _) = monitor_area(&window, rect)?;
    let fitted = rect.fit(area, 0);
    window
        .set_position(PhysicalPosition::new(fitted.x, fitted.y))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bottom_right_panel_is_fully_visible() {
        let area = Rect {
            x: 0,
            y: 25,
            width: 1440,
            height: 825,
        };
        let panel = Rect {
            x: 990,
            y: 520,
            width: 540,
            height: 640,
        }
        .fit(area, 12);
        assert_eq!(
            panel,
            Rect {
                x: 888,
                y: 198,
                width: 540,
                height: 640
            }
        );
    }
    #[test]
    fn negative_monitor_and_high_dpi() {
        let area = Rect {
            x: -2880,
            y: -900,
            width: 2880,
            height: 1700,
        };
        let panel = Rect {
            x: -400,
            y: 600,
            width: 1080,
            height: 1280,
        }
        .fit(area, 24);
        assert_eq!(
            panel,
            Rect {
                x: -1104,
                y: -504,
                width: 1080,
                height: 1280
            }
        );
    }
    #[test]
    fn small_display_clamps_size_as_well_as_position() {
        let area = Rect {
            x: 0,
            y: 0,
            width: 480,
            height: 360,
        };
        assert_eq!(
            Rect {
                x: 999,
                y: 999,
                width: 540,
                height: 640
            }
            .fit(area, 12),
            Rect {
                x: 12,
                y: 12,
                width: 456,
                height: 336
            }
        );
    }
    #[test]
    fn returning_pet_preserves_position_and_size() {
        let area = Rect {
            x: 0,
            y: 24,
            width: 1440,
            height: 850,
        };
        let pet = Rect {
            x: 986,
            y: 540,
            width: 440,
            height: 320,
        };
        assert_eq!(pet.fit(area, 0), pet);
    }
    #[test]
    fn disconnected_monitor_returns_pet_to_visible_area() {
        let area = Rect {
            x: 0,
            y: 25,
            width: 1440,
            height: 825,
        };
        let pet = Rect {
            x: -2500,
            y: -900,
            width: 440,
            height: 320,
        }
        .fit(area, 0);
        assert_eq!((pet.x, pet.y), (0, 25));
    }
}
