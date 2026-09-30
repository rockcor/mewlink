//! Crash-safe encrypted snapshots, with the committed digest and wrapping key
//! anchored in the OS credential store. A fresh wrapping key is used per commit.
use chacha20poly1305::{
    aead::{Aead, Payload},
    KeyInit, XChaCha20Poly1305, XNonce,
};
use rand::{rngs::OsRng, RngCore};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use zeroize::{Zeroize, Zeroizing};

type Result<T> = std::result::Result<T, String>;
const MAX_BYTES: usize = 2 * 1024 * 1024;
const AAD: &[u8] = b"mewlink-native-olm-store-v1";
#[derive(Serialize, Deserialize)]
struct Anchor {
    version: u8,
    key: [u8; 32],
    digest: [u8; 32],
}
impl Drop for Anchor {
    fn drop(&mut self) {
        self.key.zeroize();
    }
}
pub trait AnchorBackend {
    fn read(&self) -> Result<Option<String>>;
    fn write(&self, value: &str) -> Result<()>;
}
pub struct NativeAnchor;
impl AnchorBackend for NativeAnchor {
    fn read(&self) -> Result<Option<String>> {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            let entry = keyring::Entry::new("app.mewlink.desktop.ratchet", "anchor-v1")
                .map_err(|_| "secure_storage_unavailable")?;
            match entry.get_password() {
                Ok(v) => Ok(Some(v)),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(_) => Err("secure_storage_unavailable".into()),
            }
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        Err("secure_storage_unsupported".into())
    }
    fn write(&self, value: &str) -> Result<()> {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            keyring::Entry::new("app.mewlink.desktop.ratchet", "anchor-v1")
                .map_err(|_| "secure_storage_unavailable")?
                .set_password(value)
                .map_err(|_| "secure_storage_unavailable".into())
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let _ = value;
            Err("secure_storage_unsupported".into())
        }
    }
}

pub struct Vault<B: AnchorBackend> {
    directory: PathBuf,
    backend: B,
    _lock: File,
}
fn error(_: impl std::fmt::Display) -> String {
    "ratchet_storage_error".into()
}
fn private_open(path: &Path, truncate: bool) -> Result<File> {
    if fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err("unsafe_storage_path".into());
    }
    let mut options = OpenOptions::new();
    options
        .read(true)
        .write(true)
        .create(true)
        .truncate(truncate);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path).map_err(error)
}
fn read_file(path: &Path) -> Result<Option<Vec<u8>>> {
    if !path.exists() {
        return Ok(None);
    }
    if fs::symlink_metadata(path)
        .map_err(error)?
        .file_type()
        .is_symlink()
    {
        return Err("unsafe_storage_path".into());
    }
    let mut bytes = vec![];
    File::open(path)
        .map_err(error)?
        .take((MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(error)?;
    if bytes.len() > MAX_BYTES {
        return Err("ratchet_store_too_large".into());
    }
    Ok(Some(bytes))
}
fn sync_directory(directory: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        File::open(directory)
            .map_err(error)?
            .sync_all()
            .map_err(error)?;
    }
    #[cfg(not(unix))]
    {
        let _ = directory;
    }
    Ok(())
}
impl<B: AnchorBackend> Vault<B> {
    pub fn open(directory: &Path, backend: B) -> Result<Self> {
        fs::create_dir_all(directory).map_err(error)?;
        if fs::symlink_metadata(directory)
            .map_err(error)?
            .file_type()
            .is_symlink()
        {
            return Err("unsafe_storage_path".into());
        }
        let lock = private_open(&directory.join("ratchet.lock"), false)?;
        // Also serializes separate app processes, not just threads in one app.
        lock.lock().map_err(error)?;
        Ok(Self {
            directory: directory.into(),
            backend,
            _lock: lock,
        })
    }
    pub fn load<T: DeserializeOwned>(&self) -> Result<Option<T>> {
        let record = self.backend.read()?.map(Zeroizing::new);
        let current = self.directory.join("ratchet.bin");
        let pending = self.directory.join("ratchet.pending");
        let Some(record) = record else {
            if current.exists() || pending.exists() {
                return Err("ratchet_anchor_missing".into());
            }
            return Ok(None);
        };
        let anchor: Anchor = serde_json::from_str(&record).map_err(error)?;
        if anchor.version != 1 {
            return Err("ratchet_store_version".into());
        }
        for path in [&current, &pending] {
            if let Some(bytes) = read_file(path)? {
                if bytes.len() < 40 || Sha256::digest(&bytes).as_slice() != anchor.digest {
                    continue;
                }
                let cipher = XChaCha20Poly1305::new((&anchor.key).into());
                let plain = Zeroizing::new(
                    cipher
                        .decrypt(
                            XNonce::from_slice(&bytes[..24]),
                            Payload {
                                msg: &bytes[24..],
                                aad: AAD,
                            },
                        )
                        .map_err(error)?,
                );
                let value = serde_json::from_slice(&plain).map_err(error)?;
                if path == &pending {
                    fs::rename(&pending, &current).map_err(error)?;
                    sync_directory(&self.directory)?;
                }
                return Ok(Some(value));
            }
        }
        // Never reset a session because a backup, wrong file, or failed write
        // failed validation. A coordinated rollback of Keychain is out of scope.
        Err("ratchet_rollback_or_corruption".into())
    }
    pub fn commit<T: Serialize>(&self, value: &T) -> Result<()> {
        let plain = Zeroizing::new(serde_json::to_vec(value).map_err(error)?);
        if plain.len() > MAX_BYTES - 64 {
            return Err("ratchet_store_full".into());
        }
        let mut anchor = Anchor {
            version: 1,
            key: [0; 32],
            digest: [0; 32],
        };
        OsRng.fill_bytes(&mut anchor.key);
        let mut nonce = [0; 24];
        OsRng.fill_bytes(&mut nonce);
        let cipher = XChaCha20Poly1305::new((&anchor.key).into());
        let encrypted = cipher
            .encrypt(
                (&nonce).into(),
                Payload {
                    msg: &plain,
                    aad: AAD,
                },
            )
            .map_err(error)?;
        let bytes = [nonce.as_slice(), &encrypted].concat();
        anchor.digest.copy_from_slice(&Sha256::digest(&bytes));
        let pending = self.directory.join("ratchet.pending");
        let mut file = private_open(&pending, true)?;
        file.write_all(&bytes).map_err(error)?;
        file.sync_all().map_err(error)?;
        drop(file);
        sync_directory(&self.directory)?;
        let record = Zeroizing::new(serde_json::to_string(&anchor).map_err(error)?);
        self.backend.write(&record)?;
        let verified = self.backend.read()?.map(Zeroizing::new);
        if verified.as_deref().map(|v| v.as_str()) != Some(record.as_str()) {
            return Err("ratchet_anchor_verification_failed".into());
        }
        // Publication boundary: callers can release ciphertext/plaintext only
        // after this commit returns. Recovery can finish the rename after a crash.
        fs::rename(&pending, self.directory.join("ratchet.bin")).map_err(error)?;
        sync_directory(&self.directory)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, rc::Rc};
    #[derive(Clone, Default)]
    struct Memory(Rc<RefCell<Option<String>>>);
    impl AnchorBackend for Memory {
        fn read(&self) -> Result<Option<String>> {
            Ok(self.0.borrow().clone())
        }
        fn write(&self, value: &str) -> Result<()> {
            *self.0.borrow_mut() = Some(value.into());
            Ok(())
        }
    }
    fn directory() -> PathBuf {
        let mut id = [0; 16];
        OsRng.fill_bytes(&mut id);
        std::env::temp_dir().join(format!("mewlink-vault-test-{:x}", u128::from_le_bytes(id)))
    }
    #[test]
    fn encrypts_restarts_and_rejects_file_rollback() {
        let directory = directory();
        let backend = Memory::default();
        let vault = Vault::open(&directory, backend.clone()).unwrap();
        vault.commit(&vec!["first secret"]).unwrap();
        let old = fs::read(directory.join("ratchet.bin")).unwrap();
        assert!(!String::from_utf8_lossy(&old).contains("first secret"));
        vault.commit(&vec!["second secret"]).unwrap();
        drop(vault);
        let vault = Vault::open(&directory, backend).unwrap();
        assert_eq!(
            vault.load::<Vec<String>>().unwrap().unwrap(),
            vec!["second secret"]
        );
        fs::write(directory.join("ratchet.bin"), old).unwrap();
        assert!(vault.load::<Vec<String>>().is_err());
        drop(vault);
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn recovers_committed_pending_file_and_refuses_missing_anchor() {
        let directory = directory();
        let backend = Memory::default();
        let vault = Vault::open(&directory, backend.clone()).unwrap();
        vault.commit(&42).unwrap();
        fs::rename(
            directory.join("ratchet.bin"),
            directory.join("ratchet.pending"),
        )
        .unwrap();
        assert_eq!(vault.load::<u32>().unwrap(), Some(42));
        assert!(directory.join("ratchet.bin").exists());
        *backend.0.borrow_mut() = None;
        assert!(vault.load::<u32>().is_err());
        drop(vault);
        fs::remove_dir_all(directory).unwrap();
    }

    #[derive(Clone, Default)]
    struct Faulty {
        memory: Memory,
        fail: Rc<std::cell::Cell<bool>>,
        after_write: Rc<std::cell::Cell<bool>>,
    }
    impl AnchorBackend for Faulty {
        fn read(&self) -> Result<Option<String>> {
            self.memory.read()
        }
        fn write(&self, value: &str) -> Result<()> {
            if self.fail.get() {
                if self.after_write.get() {
                    self.memory.write(value)?;
                }
                return Err("simulated_keychain_failure".into());
            }
            self.memory.write(value)
        }
    }
    #[test]
    fn failed_anchor_write_keeps_previous_state_and_never_publishes_new_state() {
        let directory = directory();
        let backend = Faulty::default();
        let vault = Vault::open(&directory, backend.clone()).unwrap();
        vault.commit(&1_u32).unwrap();
        backend.fail.set(true);
        assert!(vault.commit(&2_u32).is_err());
        assert_eq!(vault.load::<u32>().unwrap(), Some(1));
        backend.after_write.set(true);
        assert!(vault.commit(&3_u32).is_err());
        drop(vault);
        let restarted = Vault::open(&directory, backend).unwrap();
        // Keychain may have committed despite returning an uncertain error.
        assert_eq!(restarted.load::<u32>().unwrap(), Some(3));
        drop(restarted);
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn old_wrapping_key_cannot_open_new_snapshot() {
        let directory = directory();
        let backend = Memory::default();
        let vault = Vault::open(&directory, backend.clone()).unwrap();
        vault.commit(&1_u32).unwrap();
        let old: Anchor = serde_json::from_str(&backend.read().unwrap().unwrap()).unwrap();
        vault.commit(&2_u32).unwrap();
        let bytes = fs::read(directory.join("ratchet.bin")).unwrap();
        let cipher = XChaCha20Poly1305::new((&old.key).into());
        assert!(cipher
            .decrypt(
                XNonce::from_slice(&bytes[..24]),
                Payload {
                    msg: &bytes[24..],
                    aad: AAD
                }
            )
            .is_err());
        drop(vault);
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    #[test]
    #[ignore = "Explicit opt-in: isolated OS credential and temporary encrypted vault"]
    fn native_vault_round_trip() {
        struct TestCredential(keyring::Entry);
        impl AnchorBackend for TestCredential {
            fn read(&self) -> Result<Option<String>> {
                match self.0.get_password() {
                    Ok(value) => Ok(Some(value)),
                    Err(keyring::Error::NoEntry) => Ok(None),
                    Err(_) => Err("test_credential_error".into()),
                }
            }
            fn write(&self, value: &str) -> Result<()> {
                self.0
                    .set_password(value)
                    .map_err(|_| "test_credential_error".into())
            }
        }
        impl Drop for TestCredential {
            fn drop(&mut self) {
                let _ = self.0.delete_credential();
            }
        }
        let directory = directory();
        let backend = TestCredential(
            keyring::Entry::new(
                "app.mewlink.security-test.ratchet",
                directory.file_name().unwrap().to_str().unwrap(),
            )
            .unwrap(),
        );
        let vault = Vault::open(&directory, backend).unwrap();
        vault.commit(&vec!["isolated test state"]).unwrap();
        assert_eq!(
            vault.load::<Vec<String>>().unwrap().unwrap(),
            vec!["isolated test state"]
        );
        vault.commit(&vec!["advanced test state"]).unwrap();
        assert_eq!(
            vault.load::<Vec<String>>().unwrap().unwrap(),
            vec!["advanced test state"]
        );
        drop(vault);
        fs::remove_dir_all(directory).unwrap();
    }
}
