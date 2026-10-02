//! Test-only stdin/stdout peer. No Tauri registration and no real credentials.
#[path = "../src/ratchet/engine.rs"]
mod engine;
#[path = "../src/live/rooms.rs"]
mod rooms;
use engine::{Context, Envelope, Machine, Offer};
use rooms::{LiveRooms, Pulse};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

// Mirrors the Tauri `ratchet_command` and `live_command` surfaces for tests.
fn command(
    machine: &mut Option<Machine>,
    live: &mut LiveRooms,
    operation: &str,
    input: Value,
) -> Result<Value, String> {
    if operation == "create" || operation == "join" {
        let context: Context =
            serde_json::from_value(input["context"].clone()).map_err(|_| "invalid_context")?;
        let bootstrap = input["bootstrap"].as_str().ok_or("bootstrap_missing")?;
        *machine = Some(if operation == "create" {
            Machine::creator(context, bootstrap)?
        } else {
            let offer: Offer =
                serde_json::from_value(input["offer"].clone()).map_err(|_| "invalid_offer")?;
            Machine::joiner(context, offer, bootstrap)?
        });
        return Ok(json!({"offer": machine.as_ref().unwrap().offer}));
    }
    let active = machine.as_mut().ok_or("session_missing")?;
    let relationship = active.context.relationship_id.clone();
    let device = active.context.device_id.clone();
    match operation {
        "live_status" => return Ok(live.status(&relationship)),
        "forget" => {
            live.forget(&relationship);
            *machine = None;
            return Ok(Value::Null);
        }
        "live_seal" => {
            let pulse = Pulse::from_json(&input["pulse"])?;
            return Ok(Value::String(live.seal(
                &relationship,
                &device,
                pulse,
                Instant::now(),
            )?));
        }
        "live_open" => {
            let sender = input["senderDeviceId"]
                .as_str()
                .ok_or("invalid_senderDeviceId")?;
            return Ok(live
                .open(&relationship, sender, &input["frame"], Instant::now())?
                .to_json());
        }
        "send_live_key" => {
            let prepared = live.prepare_own_key(&relationship, &device, Instant::now(), unix_ms());
            active.send(prepared.event.clone())?;
            return Ok(json!({"epoch": live.install_own_key(&relationship, prepared)}));
        }
        "send_live_off" => {
            active.send(LiveRooms::off_event(&relationship, &device, unix_ms()))?;
            live.clear_own_key(&relationship);
            return Ok(Value::Null);
        }
        _ => {}
    }
    match operation {
        "status" => Ok(json!(active.status())),
        "pending" => {
            let deliveries = active.deliveries();
            let consumed = live.absorb(
                &relationship,
                deliveries.iter().map(|d| (d.receipt.as_str(), &d.event)),
                Instant::now(),
            );
            for receipt in &consumed {
                active.ack_incoming(receipt);
            }
            let incoming: Vec<_> = deliveries
                .into_iter()
                .filter(|d| !consumed.contains(&d.receipt))
                .collect();
            let outgoing: Result<Vec<_>, String> = active
                .outbox
                .iter()
                .map(|envelope| {
                    Ok(json!({"receipt": engine::fingerprint(envelope)?, "envelope": envelope}))
                })
                .collect();
            Ok(json!({"outgoing": outgoing?, "incoming": incoming}))
        }
        "confirm" => {
            active.confirm(
                input["safetyNumber"]
                    .as_str()
                    .ok_or("verification_required")?,
            )?;
            Ok(Value::Null)
        }
        "send" => Ok(json!(active.send(input)?)),
        "receive" => {
            let envelope: Envelope =
                serde_json::from_value(input).map_err(|_| "invalid_envelope")?;
            active.receive(&envelope)?;
            Ok(Value::Null)
        }
        "ack_incoming" => {
            active.ack_incoming(input.as_str().ok_or("invalid_receipt")?);
            Ok(Value::Null)
        }
        "ack_outgoing" => {
            active.ack_outgoing(input.as_str().ok_or("invalid_receipt")?);
            Ok(Value::Null)
        }
        "restart" => {
            *active =
                serde_json::from_slice(&serde_json::to_vec(active).map_err(|_| "state_error")?)
                    .map_err(|_| "state_error")?;
            Ok(Value::Null)
        }
        _ => Err("invalid_operation".into()),
    }
}

fn main() {
    let mut machine = None;
    let mut live = LiveRooms::default();
    for line in io::stdin().lock().lines() {
        let response = (|| {
            let value: Value =
                serde_json::from_str(&line.map_err(|_| "io_error")?).map_err(|_| "invalid_json")?;
            command(
                &mut machine,
                &mut live,
                value["operation"].as_str().ok_or("invalid_operation")?,
                value["input"].clone(),
            )
        })();
        println!(
            "{}",
            match response {
                Ok(value) => json!({"ok": value}),
                Err(error) => json!({"error": error}),
            }
        );
        io::stdout().flush().unwrap();
    }
}
