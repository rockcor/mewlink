// A fixed, app-owned credential only. Never expose arbitrary Keychain queries.
const MAX_RECORD_BYTES: usize = 2_400;
#[cfg(any(target_os = "macos", target_os = "windows"))]
const ACCOUNT: &str = "pairing-v2";
#[cfg(any(target_os = "macos", target_os = "windows", test))]
const RELEASE_IDENTIFIER: &str = "app.mewlink.desktop";
static IDENTIFIER: std::sync::OnceLock<String> = std::sync::OnceLock::new();

/// Keychain items are named after the app's identifier, so MewLink keeps
/// "app.mewlink.desktop.pairing" and ".ratchet" while a QA build
/// (app.mewlink.desktop.qa) has items of its own and never reads or advances
/// the real pairing. Called once at startup.
pub fn use_identifier(identifier: &str) {
    let _ = IDENTIFIER.set(identifier.to_owned());
}

#[cfg(any(target_os = "macos", target_os = "windows", test))]
fn service_name(identifier: &str, item: &str) -> String {
    format!("{identifier}.{item}")
}

/// The keychain service for one of the app's items ("pairing", "ratchet").
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(crate) fn keychain_service(item: &str) -> String {
    service_name(
        IDENTIFIER.get().map_or(RELEASE_IDENTIFIER, String::as_str),
        item,
    )
}
static STORE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn validate_record(value: &str) -> Result<(), String> {
    if value.len() > MAX_RECORD_BYTES {
        return Err("secure_storage_record_too_large".into());
    }
    let record: serde_json::Value =
        serde_json::from_str(value).map_err(|_| "secure_storage_invalid_record")?;
    if record.get("version").and_then(|v| v.as_u64()) != Some(2)
        || !matches!(
            record.get("kind").and_then(|v| v.as_str()),
            Some("active" | "revoking" | "empty")
        )
    {
        return Err("secure_storage_invalid_record".into());
    }
    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(&keychain_service("pairing"), ACCOUNT)
        .map_err(|_| "secure_storage_unavailable".into())
}

fn read_record() -> Result<Option<String>, String> {
    let _guard = STORE_LOCK
        .lock()
        .map_err(|_| "secure_storage_unavailable")?;
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        match entry()?.get_password() {
            Ok(value) => {
                validate_record(&value)?;
                Ok(Some(value))
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            // Do not format backend errors: some variants contain secret bytes.
            Err(_) => Err("secure_storage_unavailable".into()),
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Err("secure_storage_unsupported".into())
}

fn write_record(value: String) -> Result<(), String> {
    validate_record(&value)?;
    let _guard = STORE_LOCK
        .lock()
        .map_err(|_| "secure_storage_unavailable")?;
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        entry()?
            .set_password(&value)
            .map_err(|_| "secure_storage_unavailable".into())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Err("secure_storage_unsupported".into())
}

#[tauri::command]
pub async fn read_pairing_secure() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(read_record)
        .await
        .map_err(|_| "secure_storage_unavailable")?
}

#[tauri::command]
pub async fn write_pairing_secure(value: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || write_record(value))
        .await
        .map_err(|_| "secure_storage_unavailable")?
}

#[cfg(test)]
mod tests {
    #[test]
    fn release_keeps_its_keychain_names_and_qa_gets_its_own() {
        assert_eq!(
            super::service_name(super::RELEASE_IDENTIFIER, "pairing"),
            "app.mewlink.desktop.pairing"
        );
        assert_eq!(
            super::service_name(super::RELEASE_IDENTIFIER, "ratchet"),
            "app.mewlink.desktop.ratchet"
        );
        assert_eq!(
            super::service_name("app.mewlink.desktop.qa", "pairing"),
            "app.mewlink.desktop.qa.pairing"
        );
    }

    use super::*;

    #[test]
    fn rejects_unknown_and_oversized_records() {
        assert!(validate_record(r#"{"version":2,"kind":"empty"}"#).is_ok());
        assert!(validate_record(r#"{"version":1,"kind":"active"}"#).is_err());
        assert!(validate_record(r#"{"version":2,"kind":"unknown"}"#).is_err());
        assert!(validate_record(&"x".repeat(MAX_RECORD_BYTES + 1)).is_err());
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    #[test]
    #[ignore = "Explicit opt-in: creates and deletes an isolated test credential"]
    fn native_credential_round_trip() {
        let account = format!(
            "test-{}-{:?}",
            std::process::id(),
            std::time::SystemTime::now()
        );
        let test_entry = keyring::Entry::new("app.mewlink.security-test", &account).unwrap();
        let value = r#"{"version":2,"kind":"empty"}"#;
        test_entry
            .set_password(value)
            .expect("test credential write failed");
        let matched = test_entry
            .get_password()
            .map(|read| read == value)
            .unwrap_or(false);
        test_entry
            .delete_credential()
            .expect("test credential cleanup failed");
        assert!(matched, "test credential read-back failed");
        assert!(matches!(
            test_entry.get_password(),
            Err(keyring::Error::NoEntry)
        ));
    }
}
