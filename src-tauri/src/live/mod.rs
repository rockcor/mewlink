//! Tauri surface for live typing keys. Key material stays in this process; the
//! only outputs are epochs, sealed frames and opened pulse counts.

pub mod rooms;

use rooms::{LiveRooms, Pulse};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Default, Clone)]
pub struct LiveState(pub Arc<Mutex<LiveRooms>>);

/// macOS turns on Secure Event Input while a password field (or `sudo` in a
/// terminal) has focus. No pulse is sealed then, so typing rhythm in password
/// entry never leaves the device. Windows has no equivalent signal.
#[cfg(target_os = "macos")]
fn secure_input_active() -> bool {
    #[link(name = "Carbon", kind = "framework")]
    extern "C" {
        fn IsSecureEventInputEnabled() -> u8;
    }
    // SAFETY: a parameterless query of global HIToolbox state.
    unsafe { IsSecureEventInputEnabled() != 0 }
}
#[cfg(not(target_os = "macos"))]
fn secure_input_active() -> bool {
    false
}

#[tauri::command]
pub fn live_command(
    state: tauri::State<'_, LiveState>,
    operation: String,
    relationship_id: String,
    input: Value,
) -> Result<Value, String> {
    if !crate::ratchet::valid_id(&relationship_id) {
        return Err("invalid_relationship".into());
    }
    let mut rooms = state.0.lock().map_err(|_| "live_state_error")?;
    let now = Instant::now();
    let device = |name: &str| {
        input
            .get(name)
            .and_then(Value::as_str)
            .filter(|id| crate::ratchet::valid_id(id))
            .map(str::to_owned)
            .ok_or_else(|| format!("invalid_{name}"))
    };
    match operation.as_str() {
        "status" => Ok(rooms.status(&relationship_id)),
        "seal" => {
            if secure_input_active() {
                return Err("secure_input".into());
            }
            let pulse = Pulse::from_json(input.get("pulse").ok_or("invalid_pulse")?)?;
            Ok(Value::String(rooms.seal(
                &relationship_id,
                &device("deviceId")?,
                pulse,
                now,
            )?))
        }
        "open" => {
            let frame = input.get("frame").ok_or("invalid_frame")?;
            Ok(rooms
                .open(&relationship_id, &device("senderDeviceId")?, frame, now)?
                .to_json())
        }
        "forget" => {
            rooms.forget(&relationship_id);
            Ok(Value::Null)
        }
        _ => Err("unknown_live_operation".into()),
    }
}
