//! Short-lived keys for live typing pulses (see the "MewLink 实时打字动画通道设计" doc).
//!
//! Each device creates its own 32-byte key and sends it to the peer inside the
//! verified ratchet as a `live.key` event. Keys live only in this process's
//! memory: never in JavaScript, never on disk (a restart makes a new epoch).
//! Pulses are XChaCha20-Poly1305 sealed, bound to relationship, sender, epoch
//! and sequence, and always the same size whatever the counts are.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use rand::RngCore;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use zeroize::Zeroizing;

pub const KEY_EVENT_KIND: &str = "live.key";
const PLAINTEXT_BYTES: usize = 32;
const NONCE_BYTES: usize = 24;
const TAG_BYTES: usize = 16;
pub const MAX_KEY_AGE: Duration = Duration::from_secs(24 * 60 * 60);
pub const MAX_SEQUENCE: u64 = 100_000;
pub const RETIRE_AFTER: Duration = Duration::from_secs(60);

type Result<T> = std::result::Result<T, String>;

struct OwnKey {
    epoch: u64,
    key: Zeroizing<[u8; 32]>,
    sequence: u64,
    born: Instant,
}

struct PeerKey {
    epoch: u64,
    key: Zeroizing<[u8; 32]>,
    last_sequence: u64,
    retire_at: Option<Instant>,
}

#[derive(Default)]
struct Room {
    own: Option<OwnKey>,
    peers: Vec<PeerKey>,
    peer_enabled: bool,
}

/// A key prepared for sending; installed only once the ratchet accepted it.
pub struct PreparedKey {
    own: OwnKey,
    pub event: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Pulse {
    pub window: u32,
    pub keyboard: u16,
    pub pointer: u16,
    pub clicks: u16,
    pub activity: u8,
    pub visual: u8,
    pub nudge: bool,
}

impl Pulse {
    pub fn from_json(value: &Value) -> Result<Self> {
        let number = |name: &str, max: u64| {
            value
                .get(name)
                .and_then(Value::as_u64)
                .filter(|n| *n <= max)
                .ok_or_else(|| format!("invalid_{name}"))
        };
        Ok(Self {
            window: number("window", u32::MAX as u64)? as u32,
            keyboard: number("keyboard", u16::MAX as u64)? as u16,
            pointer: number("pointer", u16::MAX as u64)? as u16,
            clicks: number("clicks", u16::MAX as u64)? as u16,
            activity: number("activity", 15)? as u8,
            visual: number("visual", 15)? as u8,
            nudge: value.get("nudge").and_then(Value::as_bool).unwrap_or(false),
        })
    }

    pub fn to_json(self) -> Value {
        json!({"window": self.window, "keyboard": self.keyboard, "pointer": self.pointer,
            "clicks": self.clicks, "activity": self.activity, "visual": self.visual, "nudge": self.nudge})
    }

    fn encode(self) -> Zeroizing<[u8; PLAINTEXT_BYTES]> {
        let mut out = Zeroizing::new([0u8; PLAINTEXT_BYTES]);
        out[0] = 1;
        out[1..5].copy_from_slice(&self.window.to_be_bytes());
        out[5..7].copy_from_slice(&self.keyboard.to_be_bytes());
        out[7..9].copy_from_slice(&self.pointer.to_be_bytes());
        out[9..11].copy_from_slice(&self.clicks.to_be_bytes());
        out[11] = self.activity;
        out[12] = self.visual;
        out[13] = u8::from(self.nudge);
        out
    }

    fn decode(bytes: &[u8]) -> Result<Self> {
        if bytes.len() != PLAINTEXT_BYTES
            || bytes[0] != 1
            || bytes[13] > 1
            || bytes[14..].iter().any(|b| *b != 0)
        {
            return Err("invalid_pulse".into());
        }
        let u16_at = |i: usize| u16::from_be_bytes([bytes[i], bytes[i + 1]]);
        Ok(Self {
            window: u32::from_be_bytes([bytes[1], bytes[2], bytes[3], bytes[4]]),
            keyboard: u16_at(5),
            pointer: u16_at(7),
            clicks: u16_at(9),
            activity: bytes[11],
            visual: bytes[12],
            nudge: bytes[13] == 1,
        })
    }
}

fn associated(relationship_id: &str, sender: &str, epoch: u64, sequence: u64) -> String {
    format!("mewlink-live-v1|{relationship_id}|{sender}|{epoch}|{sequence}")
}

/// RFC 3339 UTC timestamp for a Unix time in milliseconds.
pub fn iso8601(unix_ms: u64) -> String {
    let seconds = unix_ms / 1000;
    let (days, rem) = (seconds / 86_400, seconds % 86_400);
    // Civil-from-days (Howard Hinnant), valid for the Unix era.
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60,
        unix_ms % 1000
    )
}

fn random_id() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn key_event(relationship_id: &str, device_id: &str, unix_ms: u64, payload: Value) -> Value {
    json!({"version": 1, "id": random_id(), "relationshipId": relationship_id, "senderDeviceId": device_id,
        "createdAt": iso8601(unix_ms), "kind": KEY_EVENT_KIND, "payload": payload})
}

#[derive(Default)]
pub struct LiveRooms {
    rooms: HashMap<String, Room>,
}

impl LiveRooms {
    /// A fresh own key and the ratchet event that carries it to the peer.
    pub fn prepare_own_key(
        &self,
        relationship_id: &str,
        device_id: &str,
        now: Instant,
        unix_ms: u64,
    ) -> PreparedKey {
        let previous = self
            .rooms
            .get(relationship_id)
            .and_then(|room| room.own.as_ref())
            .map_or(0, |own| own.epoch);
        let epoch = unix_ms.max(previous + 1);
        let mut key = Zeroizing::new([0u8; 32]);
        rand::thread_rng().fill_bytes(key.as_mut());
        let encoded = Zeroizing::new(B64.encode(key.as_ref()));
        let event = key_event(
            relationship_id,
            device_id,
            unix_ms,
            json!({"epoch": epoch, "key": encoded.as_str()}),
        );
        PreparedKey {
            own: OwnKey {
                epoch,
                key,
                sequence: 0,
                born: now,
            },
            event,
        }
    }

    pub fn install_own_key(&mut self, relationship_id: &str, prepared: PreparedKey) -> u64 {
        let epoch = prepared.own.epoch;
        self.rooms
            .entry(relationship_id.to_string())
            .or_default()
            .own = Some(prepared.own);
        epoch
    }

    /// Tells the peer live typing is off; the caller drops its own key once sent.
    pub fn off_event(relationship_id: &str, device_id: &str, unix_ms: u64) -> Value {
        key_event(
            relationship_id,
            device_id,
            unix_ms,
            json!({"epoch": 0, "key": null}),
        )
    }

    pub fn clear_own_key(&mut self, relationship_id: &str) {
        if let Some(room) = self.rooms.get_mut(relationship_id) {
            room.own = None;
        }
    }

    /// Takes `live.key` deliveries out of the ratchet inbox so key material
    /// never reaches JavaScript. Returns the receipts to acknowledge.
    pub fn absorb<'a>(
        &mut self,
        relationship_id: &str,
        deliveries: impl IntoIterator<Item = (&'a str, &'a Value)>,
        now: Instant,
    ) -> Vec<String> {
        let mut consumed = vec![];
        for (receipt, event) in deliveries {
            if event.get("kind").and_then(Value::as_str) != Some(KEY_EVENT_KIND) {
                continue;
            }
            consumed.push(receipt.to_string());
            let room = self.rooms.entry(relationship_id.to_string()).or_default();
            let payload = &event["payload"];
            let epoch = payload.get("epoch").and_then(Value::as_u64).unwrap_or(0);
            match payload.get("key") {
                Some(Value::Null) => {
                    room.peer_enabled = false;
                    room.peers.clear();
                }
                Some(Value::String(encoded)) => {
                    let Ok(decoded) = B64.decode(encoded) else {
                        continue;
                    };
                    let decoded = Zeroizing::new(decoded);
                    let Ok(raw) = <[u8; 32]>::try_from(decoded.as_slice()) else {
                        continue;
                    };
                    if room.peers.iter().any(|peer| peer.epoch >= epoch) || epoch == 0 {
                        continue; // never roll back to an older epoch
                    }
                    for peer in &mut room.peers {
                        peer.retire_at.get_or_insert(now + RETIRE_AFTER);
                    }
                    room.peers.push(PeerKey {
                        epoch,
                        key: Zeroizing::new(raw),
                        last_sequence: 0,
                        retire_at: None,
                    });
                    room.peer_enabled = true;
                }
                _ => {}
            }
        }
        consumed
    }

    pub fn seal(
        &mut self,
        relationship_id: &str,
        sender: &str,
        pulse: Pulse,
        now: Instant,
    ) -> Result<String> {
        let own = self
            .rooms
            .get_mut(relationship_id)
            .and_then(|room| room.own.as_mut())
            .ok_or("no_live_key")?;
        if now.duration_since(own.born) >= MAX_KEY_AGE || own.sequence >= MAX_SEQUENCE {
            return Err("rekey_required".into());
        }
        own.sequence += 1;
        let mut nonce = [0u8; NONCE_BYTES];
        rand::thread_rng().fill_bytes(&mut nonce);
        let aad = associated(relationship_id, sender, own.epoch, own.sequence);
        let plaintext = pulse.encode();
        let ciphertext = XChaCha20Poly1305::new(own.key.as_ref().into())
            .encrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: plaintext.as_ref(),
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| "seal_failed")?;
        let mut sealed = nonce.to_vec();
        sealed.extend_from_slice(&ciphertext);
        Ok(
            json!({"t": "pulse", "e": own.epoch, "s": own.sequence, "c": B64.encode(sealed)})
                .to_string(),
        )
    }

    pub fn open(
        &mut self,
        relationship_id: &str,
        sender: &str,
        frame: &Value,
        now: Instant,
    ) -> Result<Pulse> {
        let room = self.rooms.get_mut(relationship_id).ok_or("no_peer_key")?;
        room.peers
            .retain(|peer| peer.retire_at.is_none_or(|at| at > now));
        let epoch = frame
            .get("e")
            .and_then(Value::as_u64)
            .ok_or("invalid_frame")?;
        let sequence = frame
            .get("s")
            .and_then(Value::as_u64)
            .filter(|s| *s > 0)
            .ok_or("invalid_frame")?;
        let sealed = frame
            .get("c")
            .and_then(Value::as_str)
            .and_then(|c| B64.decode(c).ok())
            .ok_or("invalid_frame")?;
        if sealed.len() != NONCE_BYTES + PLAINTEXT_BYTES + TAG_BYTES {
            return Err("invalid_frame".into());
        }
        let peer = room
            .peers
            .iter_mut()
            .find(|peer| peer.epoch == epoch)
            .ok_or("unknown_epoch")?;
        if sequence <= peer.last_sequence {
            return Err("replay".into());
        }
        let aad = associated(relationship_id, sender, epoch, sequence);
        let plaintext = Zeroizing::new(
            XChaCha20Poly1305::new(peer.key.as_ref().into())
                .decrypt(
                    XNonce::from_slice(&sealed[..NONCE_BYTES]),
                    Payload {
                        msg: &sealed[NONCE_BYTES..],
                        aad: aad.as_bytes(),
                    },
                )
                .map_err(|_| "auth_failed")?,
        );
        let pulse = Pulse::decode(&plaintext)?;
        peer.last_sequence = sequence;
        Ok(pulse)
    }

    pub fn status(&self, relationship_id: &str) -> Value {
        let room = self.rooms.get(relationship_id);
        json!({
            "ownEpoch": room.and_then(|room| room.own.as_ref()).map(|own| own.epoch),
            "peerEpoch": room.and_then(|room| room.peers.iter().map(|peer| peer.epoch).max()),
            "peerEnabled": room.is_some_and(|room| room.peer_enabled),
        })
    }

    pub fn forget(&mut self, relationship_id: &str) {
        self.rooms.remove(relationship_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REL: &str = "relationship_abcdefgh1234";
    const ALICE: &str = "device_alice_123456";
    const BOB: &str = "device_bob_12345678";

    /// Alice's key, delivered to Bob the way the ratchet would.
    fn paired(now: Instant) -> (LiveRooms, LiveRooms) {
        let mut alice = LiveRooms::default();
        let mut bob = LiveRooms::default();
        let prepared = alice.prepare_own_key(REL, ALICE, now, 1_790_000_000_000);
        let event = prepared.event.clone();
        alice.install_own_key(REL, prepared);
        let consumed = bob.absorb(REL, [("receipt-1", &event)], now);
        assert_eq!(consumed, vec!["receipt-1"]);
        (alice, bob)
    }

    fn pulse(window: u32) -> Pulse {
        Pulse {
            window,
            keyboard: 3,
            pointer: 1,
            clicks: 0,
            activity: 0,
            visual: 1,
            nudge: false,
        }
    }

    #[test]
    fn round_trip_with_fixed_size_frames() {
        let now = Instant::now();
        let (mut alice, mut bob) = paired(now);
        let small = alice.seal(REL, ALICE, pulse(7), now).unwrap();
        let big = alice
            .seal(
                REL,
                ALICE,
                Pulse {
                    keyboard: 60_000,
                    nudge: true,
                    ..pulse(8)
                },
                now,
            )
            .unwrap();
        assert_eq!(small.len(), big.len());
        let opened = bob
            .open(REL, ALICE, &serde_json::from_str(&small).unwrap(), now)
            .unwrap();
        assert_eq!(opened, pulse(7));
        let opened = bob
            .open(REL, ALICE, &serde_json::from_str(&big).unwrap(), now)
            .unwrap();
        assert!(opened.nudge && opened.keyboard == 60_000);
    }

    #[test]
    fn bound_to_relationship_sender_and_sequence() {
        let now = Instant::now();
        let (mut alice, mut bob) = paired(now);
        let frame: Value =
            serde_json::from_str(&alice.seal(REL, ALICE, pulse(1), now).unwrap()).unwrap();
        assert_eq!(bob.open(REL, BOB, &frame, now).unwrap_err(), "auth_failed");
        let mut moved = frame.clone();
        moved["s"] = json!(5);
        assert_eq!(
            bob.open(REL, ALICE, &moved, now).unwrap_err(),
            "auth_failed"
        );
        assert!(bob
            .open("relationship_other_99999", ALICE, &frame, now)
            .is_err());
        bob.open(REL, ALICE, &frame, now).unwrap();
        assert_eq!(bob.open(REL, ALICE, &frame, now).unwrap_err(), "replay");
    }

    #[test]
    fn key_events_never_reach_javascript_and_other_events_pass_through() {
        let now = Instant::now();
        let mut bob = LiveRooms::default();
        let hug = json!({"kind": "interaction", "payload": {"action": "hug"}});
        let alice = LiveRooms::default();
        let key = alice
            .prepare_own_key(REL, ALICE, now, 1_790_000_000_000)
            .event;
        let consumed = bob.absorb(REL, [("r-hug", &hug), ("r-key", &key)], now);
        assert_eq!(consumed, vec!["r-key"]);
        assert_eq!(bob.status(REL)["peerEnabled"], json!(true));
    }

    #[test]
    fn rotation_keeps_the_old_key_for_in_flight_pulses_then_drops_it() {
        let now = Instant::now();
        let (mut alice, mut bob) = paired(now);
        let old: Value =
            serde_json::from_str(&alice.seal(REL, ALICE, pulse(1), now).unwrap()).unwrap();
        let prepared = alice.prepare_own_key(REL, ALICE, now, 1_790_000_000_000);
        let event = prepared.event.clone();
        alice.install_own_key(REL, prepared);
        bob.absorb(REL, [("r2", &event)], now);
        let new: Value =
            serde_json::from_str(&alice.seal(REL, ALICE, pulse(2), now).unwrap()).unwrap();
        assert!(new["e"].as_u64() > old["e"].as_u64());
        bob.open(REL, ALICE, &new, now).unwrap();
        bob.open(REL, ALICE, &old, now + Duration::from_secs(30))
            .unwrap();
        assert_eq!(
            bob.open(REL, ALICE, &old, now + Duration::from_secs(61))
                .unwrap_err(),
            "unknown_epoch"
        );
    }

    #[test]
    fn an_older_epoch_cannot_replace_a_newer_one() {
        let now = Instant::now();
        let alice = LiveRooms::default();
        let older = alice
            .prepare_own_key(REL, ALICE, now, 1_790_000_000_000)
            .event;
        let newer = alice
            .prepare_own_key(REL, ALICE, now, 1_790_000_500_000)
            .event;
        let mut bob = LiveRooms::default();
        bob.absorb(REL, [("r1", &newer)], now);
        bob.absorb(REL, [("r2", &older)], now);
        assert_eq!(bob.status(REL)["peerEpoch"], json!(1_790_000_500_000u64));
    }

    #[test]
    fn turning_off_drops_the_peer_key() {
        let now = Instant::now();
        let (mut alice, mut bob) = paired(now);
        let frame: Value =
            serde_json::from_str(&alice.seal(REL, ALICE, pulse(1), now).unwrap()).unwrap();
        bob.absorb(
            REL,
            [("off", &LiveRooms::off_event(REL, ALICE, 1_790_000_100_000))],
            now,
        );
        assert_eq!(bob.status(REL)["peerEnabled"], json!(false));
        assert_eq!(
            bob.open(REL, ALICE, &frame, now).unwrap_err(),
            "unknown_epoch"
        );
    }

    #[test]
    fn keys_expire_by_age_and_by_sequence() {
        let now = Instant::now();
        let (mut alice, _) = paired(now);
        assert_eq!(
            alice
                .seal(REL, ALICE, pulse(1), now + MAX_KEY_AGE)
                .unwrap_err(),
            "rekey_required"
        );
        alice
            .rooms
            .get_mut(REL)
            .unwrap()
            .own
            .as_mut()
            .unwrap()
            .sequence = MAX_SEQUENCE;
        assert_eq!(
            alice.seal(REL, ALICE, pulse(1), now).unwrap_err(),
            "rekey_required"
        );
        let mut nobody = LiveRooms::default();
        assert_eq!(
            nobody.seal(REL, ALICE, pulse(1), now).unwrap_err(),
            "no_live_key"
        );
    }

    #[test]
    fn timestamps_are_rfc3339() {
        assert_eq!(iso8601(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso8601(1_790_829_313_996), "2026-10-01T04:35:13.996Z");
        assert_eq!(iso8601(951_782_400_000), "2000-02-29T00:00:00.000Z");
    }

    #[test]
    fn pulses_validate_their_fields() {
        assert!(Pulse::from_json(&json!({"window": 1, "keyboard": 70_000, "pointer": 0, "clicks": 0, "activity": 0, "visual": 0})).is_err());
        assert!(Pulse::from_json(&json!({"window": 1, "keyboard": 1, "pointer": 0, "clicks": 0, "activity": 99, "visual": 0})).is_err());
        let ok = Pulse::from_json(&json!({"window": 9, "keyboard": 1, "pointer": 2, "clicks": 3, "activity": 4, "visual": 2})).unwrap();
        assert_eq!(Pulse::decode(ok.encode().as_ref()).unwrap(), ok);
    }
}
