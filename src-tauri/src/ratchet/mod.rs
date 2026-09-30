mod engine;
mod store;

use engine::{Context, Envelope, Machine, Offer};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::Manager;
use zeroize::Zeroizing;

#[derive(Default, Serialize, Deserialize)]
struct State {
    machine: Option<Machine>,
    retired: Vec<String>,
}

// A single narrow command surface. Session state/private keys never return to JS.
#[tauri::command]
pub async fn ratchet_command(
    app: tauri::AppHandle,
    operation: String,
    relationship_id: String,
    mut input: Value,
) -> Result<Value, String> {
    if !engine::valid_id(&relationship_id) {
        return Err("invalid_relationship".into());
    }
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "ratchet_storage_error")?
        .join("secure-session");
    tauri::async_runtime::spawn_blocking(move || {
        let bootstrap = input.get_mut("bootstrap").map(Value::take).and_then(|value| match value {
            Value::String(value) => Some(Zeroizing::new(value)), _ => None,
        });
        let vault = store::Vault::open(&directory, store::NativeAnchor)?;
        let mut state: State = vault.load()?.unwrap_or_default();
        let mut dirty = false;
        let result = match operation.as_str() {
            "create" | "join" => {
                if state.retired.contains(&relationship_id) { return Err("relationship_retired".into()); }
                let context: Context = serde_json::from_value(input.get("context").cloned().ok_or("invalid_context")?).map_err(|_| "invalid_context")?;
                if context.relationship_id != relationship_id { return Err("invalid_context".into()); }
                if let Some(existing) = &state.machine {
                    if existing.context.relationship_id != relationship_id || existing.context.device_id != context.device_id {
                        return Err("active_session_exists".into());
                    }
                    if operation == "join" {
                        let offer: Offer = serde_json::from_value(input.get("offer").cloned().ok_or("invalid_offer")?).map_err(|_| "invalid_offer")?;
                        if existing.offer != offer { return Err("offer_changed".into()); }
                    }
                } else {
                    let bootstrap = bootstrap.as_ref().ok_or("bootstrap_missing")?;
                    state.machine = Some(if operation == "create" { Machine::creator(context, bootstrap)? } else {
                        let offer: Offer = serde_json::from_value(input.get("offer").cloned().ok_or("invalid_offer")?).map_err(|_| "invalid_offer")?;
                        Machine::joiner(context, offer, bootstrap)?
                    });
                    dirty = true;
                }
                json!({"offer": state.machine.as_ref().ok_or("session_missing")?.offer})
            }
            "forget" => {
                if state.machine.as_ref().is_some_and(|m| m.context.relationship_id == relationship_id) {
                    state.machine = None; dirty = true;
                }
                if !state.retired.contains(&relationship_id) {
                    state.retired.push(relationship_id.clone()); dirty = true;
                    if state.retired.len() > 64 { state.retired.remove(0); }
                }
                json!(null)
            }
            _ => {
                let machine = state.machine.as_mut().filter(|m| m.context.relationship_id == relationship_id).ok_or("session_missing")?;
                match operation.as_str() {
                    "status" => serde_json::to_value(machine.status()).map_err(|_| "ratchet_state_error")?,
                    "pending" => {
                        let outgoing: Result<Vec<_>, String> = machine.outbox.iter().map(|envelope| {
                            Ok(json!({"receipt": engine::fingerprint(envelope)?, "envelope": envelope}))
                        }).collect();
                        json!({"outgoing":outgoing?, "incoming":machine.deliveries()})
                    }
                    "confirm" => { machine.confirm(input.get("safetyNumber").and_then(Value::as_str).ok_or("verification_required")?)?; dirty = true; json!(null) }
                    "send" => { let result = machine.send(input)?; dirty = true; serde_json::to_value(result).map_err(|_| "ratchet_state_error")? }
                    "receive" => {
                        let envelope: Envelope = serde_json::from_value(input).map_err(|_| "invalid_envelope")?;
                        machine.receive(&envelope)?; dirty = true; json!(null)
                    }
                    "ack_incoming" | "ack_outgoing" => {
                        let receipt = input.as_str().filter(|s| s.len() <= 64).ok_or("invalid_receipt")?;
                        if operation == "ack_incoming" { machine.ack_incoming(receipt); } else { machine.ack_outgoing(receipt); }
                        dirty = true; json!(null)
                    }
                    _ => return Err("unknown_ratchet_operation".into()),
                }
            }
        };
        if dirty { vault.commit(&state)?; }
        Ok(result)
    }).await.map_err(|_| "ratchet_storage_error")?
}
