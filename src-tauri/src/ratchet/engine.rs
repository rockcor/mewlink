//! MewLink framing around vodozemac Olm. No custom ratchet or key schedule.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use vodozemac::{
    olm::{Account, AccountPickle, OlmMessage, Session, SessionConfig, SessionPickle},
    Curve25519PublicKey,
};
use zeroize::{Zeroize, Zeroizing};

type Result<T> = std::result::Result<T, String>;
const LIMIT: usize = 100;
const RECEIPTS: usize = 256;
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Context {
    pub relationship_id: String,
    pub device_id: String,
    pub peer_id: Option<String>,
}
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Offer {
    pub identity: String,
    pub one_time_key: String,
}
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Header {
    pub protocol_version: u8,
    pub relationship_id: String,
    pub sender_device_id: String,
    pub recipient_device_id: String,
    pub key_id: String,
    pub sequence: u64,
}
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    #[serde(flatten)]
    pub header: Header,
    // Olm message type, not a nonce. Kept for compatibility with relay framing.
    pub nonce: String,
    pub ciphertext: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Body {
    header: Header,
    kind: String,
    event: Option<Value>,
    proof: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Delivery {
    pub receipt: String,
    pub event: Value,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub established: bool,
    pub verified: bool,
    pub safety_number: String,
    pub peer_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct Machine {
    pub context: Context,
    pub offer: Offer,
    account: Option<AccountPickle>,
    session: Option<SessionPickle>,
    bootstrap: Option<String>,
    session_id: Option<String>,
    established: bool,
    verified: bool,
    next_sequence: u64,
    pub outbox: Vec<Envelope>,
    inbox: Vec<Delivery>,
    receipts: Vec<String>,
}

impl Drop for Machine {
    fn drop(&mut self) {
        if let Some(key) = &mut self.bootstrap {
            key.zeroize();
        }
    }
}

pub fn valid_id(s: &str) -> bool {
    (16..=64).contains(&s.len())
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}
fn decode_key(value: &str) -> Result<Zeroizing<Vec<u8>>> {
    let key = Zeroizing::new(B64.decode(value).map_err(|_| "invalid_bootstrap")?);
    if key.len() != 32 {
        return Err("invalid_bootstrap".into());
    }
    Ok(key)
}
fn copy<T: Serialize + for<'a> Deserialize<'a>>(value: &T) -> Result<T> {
    let encoded = Zeroizing::new(serde_json::to_vec(value).map_err(|_| "ratchet_state_error")?);
    serde_json::from_slice(&encoded).map_err(|_| "ratchet_state_error".into())
}
pub fn fingerprint(envelope: &Envelope) -> Result<String> {
    Ok(B64.encode(Sha256::digest(
        serde_json::to_vec(envelope).map_err(|_| "invalid_envelope")?,
    )))
}
fn validate_context(context: &Context) -> Result<()> {
    if !valid_id(&context.relationship_id)
        || !valid_id(&context.device_id)
        || context
            .peer_id
            .as_ref()
            .is_some_and(|p| !valid_id(p) || p == &context.device_id)
    {
        return Err("invalid_context".into());
    }
    Ok(())
}

impl Machine {
    pub fn creator(context: Context, bootstrap: &str) -> Result<Self> {
        validate_context(&context)?;
        decode_key(bootstrap)?;
        let mut account = Account::new();
        account.generate_one_time_keys(1);
        let one_time_key = account
            .one_time_keys()
            .values()
            .next()
            .ok_or("key_generation_failed")?
            .to_base64();
        let offer = Offer {
            identity: account.curve25519_key().to_base64(),
            one_time_key,
        };
        Ok(Self {
            context,
            offer,
            account: Some(account.pickle()),
            session: None,
            bootstrap: Some(bootstrap.into()),
            session_id: None,
            established: false,
            verified: false,
            next_sequence: 0,
            outbox: vec![],
            inbox: vec![],
            receipts: vec![],
        })
    }

    pub fn joiner(context: Context, offer: Offer, bootstrap: &str) -> Result<Self> {
        validate_context(&context)?;
        if context.peer_id.is_none() {
            return Err("peer_required".into());
        }
        decode_key(bootstrap)?;
        let account = Account::new();
        let session = account
            .create_outbound_session(
                SessionConfig::version_2(),
                Curve25519PublicKey::from_base64(&offer.identity).map_err(|_| "invalid_offer")?,
                Curve25519PublicKey::from_base64(&offer.one_time_key)
                    .map_err(|_| "invalid_offer")?,
            )
            .map_err(|_| "session_creation_failed")?;
        let mut machine = Self {
            context,
            offer,
            account: None,
            session_id: Some(session.session_id()),
            session: Some(session.pickle()),
            bootstrap: None,
            established: false,
            verified: false,
            next_sequence: 0,
            outbox: vec![],
            inbox: vec![],
            receipts: vec![],
        };
        let proof = machine.proof(bootstrap)?;
        machine.encrypt("hello", None, Some(proof))?;
        Ok(machine)
    }

    fn proof_mac(&self, bootstrap: &str) -> Result<Hmac<Sha256>> {
        let key = decode_key(bootstrap)?;
        let mut ids = [
            self.context.device_id.clone(),
            self.context.peer_id.clone().ok_or("peer_required")?,
        ];
        ids.sort();
        let transcript = json!([
            "mewlink-olm-bootstrap-v2",
            self.context.relationship_id,
            self.session_id,
            ids
        ]);
        let mut mac = Hmac::<Sha256>::new_from_slice(&key).map_err(|_| "invalid_bootstrap")?;
        mac.update(transcript.to_string().as_bytes());
        Ok(mac)
    }

    fn proof(&self, bootstrap: &str) -> Result<String> {
        Ok(B64.encode(self.proof_mac(bootstrap)?.finalize().into_bytes()))
    }

    pub fn status(&self) -> Status {
        let safety_number = self
            .session_id
            .as_ref()
            .map(|id| {
                let mut devices = [
                    self.context.device_id.clone(),
                    self.context.peer_id.clone().unwrap_or_default(),
                ];
                devices.sort();
                let hash = Sha256::digest(
                    json!([
                        "mewlink-safety-v2",
                        self.context.relationship_id,
                        id,
                        devices
                    ])
                    .to_string()
                    .as_bytes(),
                );
                hash[..16]
                    .chunks(2)
                    .map(|bytes| format!("{:02X}{:02X}", bytes[0], bytes[1]))
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .unwrap_or_default();
        Status {
            established: self.established,
            verified: self.verified,
            safety_number,
            peer_id: self.context.peer_id.clone(),
        }
    }

    pub fn confirm(&mut self, safety_number: &str) -> Result<()> {
        if !self.established || self.status().safety_number != safety_number {
            return Err("verification_changed".into());
        }
        self.verified = true;
        Ok(())
    }

    pub fn send(&mut self, event: Value) -> Result<Envelope> {
        if !self.verified || !self.established {
            return Err("verification_required".into());
        }
        validate_event(
            &event,
            &self.context.relationship_id,
            &self.context.device_id,
        )?;
        self.encrypt("event", Some(event), None)
    }

    fn encrypt(
        &mut self,
        kind: &str,
        event: Option<Value>,
        proof: Option<String>,
    ) -> Result<Envelope> {
        if self.outbox.len() >= LIMIT {
            return Err("outbox_full".into());
        }
        let sequence = self
            .next_sequence
            .checked_add(1)
            .filter(|n| *n <= 9_007_199_254_740_991)
            .ok_or("sequence_exhausted")?;
        let mut session =
            Session::from_pickle(copy(self.session.as_ref().ok_or("session_not_ready")?)?);
        let header = Header {
            protocol_version: 2,
            relationship_id: self.context.relationship_id.clone(),
            sender_device_id: self.context.device_id.clone(),
            recipient_device_id: self.context.peer_id.clone().ok_or("peer_required")?,
            key_id: session.session_id().replace('+', "-").replace('/', "_"),
            sequence,
        };
        let plaintext = Zeroizing::new(
            serde_json::to_vec(&Body {
                header: header.clone(),
                kind: kind.into(),
                event,
                proof,
            })
            .map_err(|_| "invalid_event")?,
        );
        if plaintext.len() > 8_000 {
            return Err("event_too_large".into());
        }
        let (message_type, bytes) = session
            .encrypt(&plaintext)
            .map_err(|_| "encryption_failed")?
            .to_parts();
        let envelope = Envelope {
            header,
            nonce: message_type.to_string(),
            ciphertext: B64.encode(bytes),
        };
        self.session = Some(session.pickle());
        self.next_sequence = sequence;
        self.outbox.push(envelope.clone());
        Ok(envelope)
    }

    pub fn receive(&mut self, envelope: &Envelope) -> Result<()> {
        // Discard all tentative ratchet changes on authentication/validation error.
        let mut candidate: Self = copy(self)?;
        candidate.receive_inner(envelope)?;
        *self = candidate;
        Ok(())
    }

    fn receive_inner(&mut self, envelope: &Envelope) -> Result<()> {
        let h = &envelope.header;
        if h.protocol_version != 2
            || h.relationship_id != self.context.relationship_id
            || h.recipient_device_id != self.context.device_id
            || !valid_id(&h.sender_device_id)
            || h.sender_device_id == self.context.device_id
            || h.sequence == 0
            || h.sequence > 9_007_199_254_740_991
            || self
                .context
                .peer_id
                .as_ref()
                .is_some_and(|p| p != &h.sender_device_id)
            || envelope.ciphertext.len() > 12_000
            || !matches!(envelope.nonce.as_str(), "0" | "1")
        {
            return Err("invalid_envelope".into());
        }
        let receipt = fingerprint(envelope)?;
        if self.receipts.contains(&receipt) {
            return Ok(());
        }
        let message = OlmMessage::from_parts(
            envelope.nonce.parse().map_err(|_| "invalid_envelope")?,
            &B64.decode(&envelope.ciphertext)
                .map_err(|_| "invalid_envelope")?,
        )
        .map_err(|_| "invalid_envelope")?;
        let first = self.session.is_none();
        let (session, plaintext) = if let Some(saved) = &self.session {
            let mut session = Session::from_pickle(copy(saved)?);
            let plaintext = session.decrypt(&message).map_err(|_| "message_rejected")?;
            (session, plaintext)
        } else {
            let OlmMessage::PreKey(prekey) = &message else {
                return Err("prekey_required".into());
            };
            let mut account =
                Account::from_pickle(copy(self.account.as_ref().ok_or("session_not_ready")?)?);
            let inbound = account
                .create_inbound_session(SessionConfig::version_2(), prekey.identity_key(), prekey)
                .map_err(|_| "message_rejected")?;
            (inbound.session, inbound.plaintext)
        };
        let plaintext = Zeroizing::new(plaintext);
        if plaintext.len() > 8_000
            || h.key_id != session.session_id().replace('+', "-").replace('/', "_")
        {
            return Err("invalid_envelope".into());
        }
        let body: Body = serde_json::from_slice(&plaintext).map_err(|_| "invalid_message")?;
        if body.header != *h {
            return Err("metadata_mismatch".into());
        }
        self.context.peer_id = Some(h.sender_device_id.clone());
        self.session_id = Some(session.session_id());
        if first {
            if body.kind != "hello" || body.event.is_some() {
                return Err("hello_required".into());
            }
            let proof = body.proof.as_ref().ok_or("bootstrap_missing")?;
            let proof = B64.decode(proof).map_err(|_| "bootstrap_invalid")?;
            self.proof_mac(self.bootstrap.as_ref().ok_or("bootstrap_missing")?)?
                .verify_slice(&proof)
                .map_err(|_| "bootstrap_invalid")?;
            self.account = None;
            if let Some(mut key) = self.bootstrap.take() {
                key.zeroize();
            }
            self.established = true;
            self.session = Some(session.pickle());
            self.encrypt("ack", None, None)?;
        } else {
            match body.kind.as_str() {
                "ack" if !self.established && body.event.is_none() && body.proof.is_none() => {
                    self.established = true;
                }
                "event" if self.established && body.proof.is_none() => {
                    let event = body.event.ok_or("invalid_event")?;
                    validate_event(&event, &h.relationship_id, &h.sender_device_id)?;
                    if self.inbox.len() >= LIMIT {
                        return Err("inbox_full".into());
                    }
                    self.inbox.push(Delivery {
                        receipt: receipt.clone(),
                        event,
                    });
                }
                _ => return Err("invalid_message_kind".into()),
            }
            // No reset/reinitialization is accepted once a session exists.
            self.session = Some(session.pickle());
        }
        self.receipts.push(receipt);
        if self.receipts.len() > RECEIPTS {
            self.receipts.remove(0);
        }
        Ok(())
    }

    pub fn deliveries(&self) -> Vec<Delivery> {
        if self.verified {
            self.inbox.clone()
        } else {
            vec![]
        }
    }
    pub fn ack_incoming(&mut self, receipt: &str) {
        self.inbox.retain(|d| d.receipt != receipt);
    }
    pub fn ack_outgoing(&mut self, receipt: &str) {
        self.outbox
            .retain(|e| fingerprint(e).as_deref() != Ok(receipt));
    }
}

fn validate_event(event: &Value, relationship: &str, sender: &str) -> Result<()> {
    if event.get("version").and_then(Value::as_u64) != Some(1)
        || event.get("relationshipId").and_then(Value::as_str) != Some(relationship)
        || event.get("senderDeviceId").and_then(Value::as_str) != Some(sender)
        || !event
            .get("id")
            .and_then(Value::as_str)
            .is_some_and(|id| !id.is_empty() && id.len() <= 80)
        || !event
            .get("createdAt")
            .and_then(Value::as_str)
            .is_some_and(|date| date.len() <= 64)
        || !event.get("payload").is_some_and(Value::is_object)
        || !matches!(
            event.get("kind").and_then(Value::as_str),
            Some(
                "interaction"
                    | "activity.segment"
                    | "profile.skin"
                    | "statistics.snapshot"
                    | "cup.consumed"
                    | "operation.batch"
                    | "live.key"
            )
        )
    {
        return Err("invalid_event".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn pair() -> (Machine, Machine) {
        let secret = B64.encode([71; 32]);
        let mut bob = Machine::creator(
            Context {
                relationship_id: "relationship_12345".into(),
                device_id: "device_bob_123456".into(),
                peer_id: None,
            },
            &secret,
        )
        .unwrap();
        let mut alice = Machine::joiner(
            Context {
                relationship_id: bob.context.relationship_id.clone(),
                device_id: "device_alice_12345".into(),
                peer_id: Some(bob.context.device_id.clone()),
            },
            bob.offer.clone(),
            &secret,
        )
        .unwrap();
        bob.receive(&alice.outbox[0]).unwrap();
        alice.receive(&bob.outbox[0]).unwrap();
        assert_eq!(alice.status().safety_number, bob.status().safety_number);
        alice.confirm(&alice.status().safety_number).unwrap();
        bob.confirm(&bob.status().safety_number).unwrap();
        alice.outbox.clear();
        bob.outbox.clear();
        (alice, bob)
    }
    fn event(machine: &Machine, id: usize) -> Value {
        json!({"version":1,"id":format!("event-{id}"),"relationshipId":machine.context.relationship_id,
            "senderDeviceId":machine.context.device_id,"createdAt":"2026-09-09T00:00:00Z","kind":"interaction","payload":{"action":"hug"}})
    }
    #[test]
    fn carries_history_and_cup_events_but_rejects_unknown_kinds() {
        let (mut a, mut b) = pair();
        let batch = json!({"version":1,"id":"history-1","relationshipId":a.context.relationship_id,
            "senderDeviceId":a.context.device_id,"createdAt":"2026-09-09T00:00:00Z","kind":"operation.batch",
            "payload":{"format":1,"startedAt":"2026-09-09T00:00:00Z","points":[[0,3,1,0,0,0]]}});
        let cup = json!({"version":1,"id":"cup-1","relationshipId":a.context.relationship_id,
            "senderDeviceId":a.context.device_id,"createdAt":"2026-09-09T00:00:01Z","kind":"cup.consumed",
            "payload":{"cupEventId":"event-7"}});
        for event in [batch, cup] {
            let envelope = a.send(event).unwrap();
            b.receive(&envelope).unwrap();
        }
        assert_eq!(b.deliveries().len(), 2);
        let mut unknown = event(&a, 99);
        unknown["kind"] = json!("location.share");
        assert_eq!(a.send(unknown).err().as_deref(), Some("invalid_event"));
    }
    #[test]
    fn exchange_and_ratchet_both_directions() {
        let (mut a, mut b) = pair();
        for n in 0..12 {
            let e = a.send(event(&a, n)).unwrap();
            b.receive(&e).unwrap();
            let e = b.send(event(&b, n)).unwrap();
            a.receive(&e).unwrap();
        }
        assert_eq!(a.deliveries().len(), 12);
        assert_eq!(b.deliveries().len(), 12);
        assert!(
            a.bootstrap.is_none()
                && b.bootstrap.is_none()
                && a.account.is_none()
                && b.account.is_none()
        );
    }
    #[test]
    fn restart_out_of_order_and_duplicate() {
        let (mut a, b) = pair();
        let messages: Vec<_> = (0..8).map(|n| a.send(event(&a, n)).unwrap()).collect();
        let mut b: Machine = copy(&b).unwrap();
        for i in [7, 0, 3, 2, 1, 6, 5, 4] {
            b.receive(&messages[i]).unwrap();
        }
        b.receive(&messages[0]).unwrap();
        assert_eq!(b.deliveries().len(), 8);
        let receipt = b.deliveries()[0].receipt.clone();
        b.ack_incoming(&receipt);
        let mut b: Machine = copy(&b).unwrap();
        b.receive(&messages[7]).unwrap();
        assert_eq!(b.deliveries().len(), 7);
    }
    #[test]
    fn tampering_does_not_advance_state_or_allow_downgrade() {
        let (mut a, mut b) = pair();
        let good = a.send(event(&a, 1)).unwrap();
        let before = serde_json::to_vec(&b).unwrap();
        for change in 0..4 {
            let mut bad = good.clone();
            match change {
                0 => bad.header.sequence += 1,
                1 => bad.header.protocol_version = 1,
                2 => bad.header.sender_device_id = "different_sender1".into(),
                _ => bad.ciphertext.replace_range(4..5, "!"),
            }
            assert!(b.receive(&bad).is_err());
            assert_eq!(before, serde_json::to_vec(&b).unwrap());
        }
        b.receive(&good).unwrap();
    }
    #[test]
    fn current_session_cannot_decrypt_already_consumed_messages() {
        let (mut a, mut b) = pair();
        let first = a.send(event(&a, 0)).unwrap();
        b.receive(&first).unwrap();
        let mut stolen = Session::from_pickle(copy(b.session.as_ref().unwrap()).unwrap());
        let message = OlmMessage::from_parts(
            first.nonce.parse().unwrap(),
            &B64.decode(&first.ciphertext).unwrap(),
        )
        .unwrap();
        assert!(stolen.decrypt(&message).is_err());
    }
    #[test]
    fn verification_is_required_and_bound_to_this_session() {
        let (mut a, _) = pair();
        a.verified = false;
        assert!(a.send(event(&a, 0)).is_err());
        assert!(a.confirm("0000 0000 0000 0000").is_err());
        a.confirm(&a.status().safety_number).unwrap();
        assert!(a.send(event(&a, 0)).is_ok());
    }
    #[test]
    fn wrong_bootstrap_cannot_consume_the_one_time_key() {
        let secret = B64.encode([1; 32]);
        let mut creator = Machine::creator(
            Context {
                relationship_id: "relationship_12345".into(),
                device_id: "device_bob_123456".into(),
                peer_id: None,
            },
            &secret,
        )
        .unwrap();
        let context = Context {
            relationship_id: creator.context.relationship_id.clone(),
            device_id: "device_alice_12345".into(),
            peer_id: Some(creator.context.device_id.clone()),
        };
        let attacker =
            Machine::joiner(context.clone(), creator.offer.clone(), &B64.encode([2; 32])).unwrap();
        let before = serde_json::to_vec(&creator).unwrap();
        assert!(creator.receive(&attacker.outbox[0]).is_err());
        assert_eq!(before, serde_json::to_vec(&creator).unwrap());
        let real = Machine::joiner(context, creator.offer.clone(), &secret).unwrap();
        creator.receive(&real.outbox[0]).unwrap();
    }
    #[test]
    fn future_messages_recover_after_fresh_dh_roundtrip() {
        let (mut a, mut b) = pair();
        let request = a.send(event(&a, 0)).unwrap();
        let mut stolen = Session::from_pickle(copy(a.session.as_ref().unwrap()).unwrap());
        b.receive(&request).unwrap();
        let response = b.send(event(&b, 1)).unwrap();
        a.receive(&response).unwrap();
        let message = OlmMessage::from_parts(
            response.nonce.parse().unwrap(),
            &B64.decode(&response.ciphertext).unwrap(),
        )
        .unwrap();
        // An old snapshot can follow this first reply, before new local entropy.
        stolen.decrypt(&message).unwrap();
        let next = a.send(event(&a, 2)).unwrap();
        b.receive(&next).unwrap();
        let recovered = b.send(event(&b, 3)).unwrap();
        a.receive(&recovered).unwrap();
        let message = OlmMessage::from_parts(
            recovered.nonce.parse().unwrap(),
            &B64.decode(&recovered.ciphertext).unwrap(),
        )
        .unwrap();
        assert!(stolen.decrypt(&message).is_err());
    }
    #[test]
    fn envelopes_round_trip_and_receipts_survive_restart() {
        let (mut a, _) = pair();
        let outgoing = a.send(event(&a, 0)).unwrap();
        let encoded = serde_json::to_value(&outgoing).unwrap();
        let parsed: Envelope = serde_json::from_value(encoded).unwrap();
        assert!(parsed == outgoing);
        assert!(valid_id(&parsed.header.key_id));
        let mut restarted: Machine = copy(&a).unwrap();
        assert!(restarted.outbox[0] == outgoing);
        restarted.ack_outgoing(&fingerprint(&outgoing).unwrap());
        assert!(restarted.outbox.is_empty());
    }
}
