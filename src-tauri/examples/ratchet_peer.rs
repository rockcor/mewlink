//! Test-only stdin/stdout peer. No Tauri registration and no real credentials.
#[path = "../src/ratchet/engine.rs"]
mod engine;
use engine::{Context, Envelope, Machine, Offer};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

fn command(machine: &mut Option<Machine>, operation: &str, input: Value) -> Result<Value, String> {
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
    match operation {
        "status" => Ok(json!(active.status())),
        "pending" => {
            let outgoing: Result<Vec<_>, String> = active
                .outbox
                .iter()
                .map(|envelope| {
                    Ok(json!({"receipt": engine::fingerprint(envelope)?, "envelope": envelope}))
                })
                .collect();
            Ok(json!({"outgoing": outgoing?, "incoming": active.deliveries()}))
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
    for line in io::stdin().lock().lines() {
        let response = (|| {
            let value: Value =
                serde_json::from_str(&line.map_err(|_| "io_error")?).map_err(|_| "invalid_json")?;
            command(
                &mut machine,
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
