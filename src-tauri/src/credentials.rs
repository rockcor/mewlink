//! Only the app's two credentials. Never log backend errors or secret values.
//! macOS probes silently first; each item may ask for authorization once per
//! process. A denial (or a later loss of access) pauses all credential access
//! until the person deliberately reopens the app, not the next relay poll.

#[derive(Clone, Copy)]
pub(crate) enum Item {
    Pairing,
    Ratchet,
}

impl Item {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    fn names(self) -> (String, &'static str) {
        let (service, account) = match self {
            Self::Pairing => ("pairing", "pairing-v2"),
            Self::Ratchet => ("ratchet", "anchor-v1"),
        };
        (crate::secure_storage::keychain_service(service), account)
    }
}

#[cfg(any(target_os = "macos", test))]
#[derive(Debug, PartialEq, Eq)]
enum AccessError {
    Authorization,
    Unavailable,
}

#[cfg(any(target_os = "macos", test))]
impl AccessError {
    fn code(self) -> String {
        match self {
            Self::Authorization => "secure_storage_authorization_required",
            Self::Unavailable => "secure_storage_unavailable",
        }
        .into()
    }
}

#[cfg(any(target_os = "macos", test))]
fn status_error(code: i32) -> AccessError {
    // Security may return either OSStatus or its legacy CSSM backend status.
    match code {
        -128 | -25293 | -25308 | -25315 | -2147416032 | -2147416031 | -2147416030 | -2147413984
        | -2147413983 | -2147413982 | -2147415840 | -2147415839 | -2147413792 | -2147413791 => {
            AccessError::Authorization
        }
        _ => AccessError::Unavailable,
    }
}

#[cfg(any(target_os = "macos", test))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Interaction {
    Silent,
    Allow,
}

#[cfg(any(target_os = "macos", test))]
#[derive(Default)]
struct AccessGate {
    prompted: [bool; 2],
    paused: bool,
}

#[cfg(any(target_os = "macos", test))]
impl AccessGate {
    fn run<T>(
        &mut self,
        item: Item,
        mut operation: impl FnMut(Interaction) -> Result<T, AccessError>,
    ) -> Result<T, AccessError> {
        if self.paused {
            return Err(AccessError::Authorization);
        }
        let result = operation(Interaction::Silent);
        if !matches!(result, Err(AccessError::Authorization)) {
            return result;
        }
        let prompted = &mut self.prompted[item as usize];
        if *prompted {
            self.paused = true;
            return Err(AccessError::Authorization);
        }
        // Consume before calling Security, even if the dialog is cancelled.
        *prompted = true;
        let result = operation(Interaction::Allow);
        if matches!(result, Err(AccessError::Authorization)) {
            self.paused = true;
        }
        result
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use security_framework::{
        base::Error,
        os::macos::keychain::{SecKeychain, SecPreferencesDomain},
    };
    // SecKeychain's interaction setting is process-wide, not thread-local.
    // All pairing AND ratchet access must hold this lock, including read-back.
    static GATE: std::sync::Mutex<AccessGate> = std::sync::Mutex::new(AccessGate {
        prompted: [false; 2],
        paused: false,
    });

    fn classify(error: Error) -> AccessError {
        status_error(error.code())
    }

    fn with_interaction<T>(
        mode: Interaction,
        operation: impl FnOnce() -> Result<T, AccessError>,
    ) -> Result<T, AccessError> {
        let allowed = SecKeychain::user_interaction_allowed().map_err(classify)?;
        if mode == Interaction::Allow && !allowed {
            // Respect a caller/system that already disabled interaction.
            return Err(AccessError::Authorization);
        }
        let _silent = if mode == Interaction::Silent && allowed {
            Some(SecKeychain::disable_user_interaction().map_err(classify)?)
        } else {
            None
        };
        // The guard restores the previous allowed state, on errors as well.
        operation()
    }

    pub(super) fn read(item: Item) -> Result<Option<String>, String> {
        let (service, account) = item.names();
        GATE.lock()
            .map_err(|_| AccessError::Unavailable.code())?
            .run(item, |mode| {
                with_interaction(mode, || {
                    let keychain = SecKeychain::default_for_domain(SecPreferencesDomain::User)
                        .map_err(classify)?;
                    match keychain.find_generic_password(&service, account) {
                        Ok((bytes, _)) => String::from_utf8(bytes.to_owned())
                            .map(Some)
                            .map_err(|_| AccessError::Unavailable),
                        Err(error) if error.code() == -25300 => Ok(None),
                        Err(error) => Err(classify(error)),
                    }
                })
            })
            .map_err(AccessError::code)
    }

    pub(super) fn write(item: Item, value: &str) -> Result<(), String> {
        let (service, account) = item.names();
        GATE.lock()
            .map_err(|_| AccessError::Unavailable.code())?
            .run(item, |mode| {
                with_interaction(mode, || {
                    let keychain = SecKeychain::default_for_domain(SecPreferencesDomain::User)
                        .map_err(classify)?;
                    let found = match keychain.find_generic_password(&service, account) {
                        Ok((_, reference)) => Ok(Some(reference)),
                        Err(error) if error.code() == -25300 => Ok(None),
                        Err(error) => Err(classify(error)),
                    };
                    update_or_create(
                        found,
                        |mut reference| reference.set_password(value.as_bytes()).map_err(classify),
                        || {
                            keychain
                                .add_generic_password(&service, account, value.as_bytes())
                                .map_err(classify)
                        },
                    )
                })
            })
            .map_err(AccessError::code)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn silent_probe_really_disables_ui_and_restores_it_on_failure() {
            let _lock = GATE.lock().unwrap();
            let before = SecKeychain::user_interaction_allowed().unwrap();
            let result: Result<(), AccessError> = with_interaction(Interaction::Silent, || {
                assert!(!SecKeychain::user_interaction_allowed().unwrap());
                Err(AccessError::Authorization)
            });
            assert_eq!(result, Err(AccessError::Authorization));
            assert_eq!(SecKeychain::user_interaction_allowed().unwrap(), before);
        }
    }
}

/// A failed lookup is NOT a missing item. Never turn denial into an add/delete
/// or reset an item's ACL. Only errSecItemNotFound permits creation.
#[cfg(any(target_os = "macos", test))]
fn update_or_create<T>(
    found: Result<Option<T>, AccessError>,
    update: impl FnOnce(T) -> Result<(), AccessError>,
    create: impl FnOnce() -> Result<(), AccessError>,
) -> Result<(), AccessError> {
    match found? {
        Some(reference) => update(reference),
        None => create(),
    }
}

pub(crate) fn read(item: Item) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    return macos::read(item);
    #[cfg(target_os = "windows")]
    {
        let (service, account) = item.names();
        let entry =
            keyring::Entry::new(&service, account).map_err(|_| "secure_storage_unavailable")?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("secure_storage_unavailable".into()),
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = item;
        Err("secure_storage_unsupported".into())
    }
}

pub(crate) fn write(item: Item, value: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return macos::write(item, value);
    #[cfg(target_os = "windows")]
    {
        let (service, account) = item.names();
        keyring::Entry::new(&service, account)
            .map_err(|_| "secure_storage_unavailable")?
            .set_password(value)
            .map_err(|_| "secure_storage_unavailable".into())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (item, value);
        Err("secure_storage_unsupported".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn permission_statuses_are_safe_codes_not_backend_error_messages() {
        for status in [
            -128,
            -25293,
            -25308,
            -25315,
            -2147416032,
            -2147415840,
            -2147415839,
            -2147413984,
        ] {
            assert_eq!(status_error(status), AccessError::Authorization);
        }
        for status in [-25300, -25299, -50, -25291] {
            assert_eq!(status_error(status), AccessError::Unavailable);
        }
    }

    #[test]
    fn normally_authorized_polls_never_enable_ui() {
        let mut gate = AccessGate::default();
        for _ in 0..100 {
            assert_eq!(
                gate.run(Item::Ratchet, |mode| {
                    assert_eq!(mode, Interaction::Silent);
                    Ok(42)
                }),
                Ok(42)
            );
        }
        assert!(!gate.prompted[Item::Ratchet as usize]);
    }

    #[test]
    fn cancelling_pauses_both_items_and_all_background_retries() {
        let mut gate = AccessGate::default();
        let calls = Cell::new(0);
        for item in [Item::Pairing, Item::Ratchet, Item::Pairing, Item::Ratchet] {
            assert_eq!(
                gate.run::<()>(item, |_| {
                    calls.set(calls.get() + 1);
                    Err(AccessError::Authorization)
                }),
                Err(AccessError::Authorization)
            );
        }
        assert_eq!(calls.get(), 2); // one silent probe + one interactive attempt
    }

    #[test]
    fn a_temporary_allow_cannot_start_an_endless_prompt_loop() {
        let mut gate = AccessGate::default();
        assert_eq!(
            gate.run(Item::Ratchet, |mode| match mode {
                Interaction::Silent => Err(AccessError::Authorization),
                Interaction::Allow => Ok(1),
            }),
            Ok(1)
        );
        for _ in 0..100 {
            assert_eq!(
                gate.run::<()>(Item::Ratchet, |mode| {
                    assert_eq!(mode, Interaction::Silent);
                    Err(AccessError::Authorization)
                }),
                Err(AccessError::Authorization)
            );
        }
        assert!(gate.paused);
    }

    #[test]
    fn each_item_can_complete_its_own_one_time_authorization() {
        let mut gate = AccessGate::default();
        for item in [Item::Pairing, Item::Ratchet] {
            assert_eq!(
                gate.run(item, |mode| match mode {
                    Interaction::Silent => Err(AccessError::Authorization),
                    Interaction::Allow => Ok(()),
                }),
                Ok(())
            );
        }
        assert!(!gate.paused);
        // Durable authorization is followed by silent read-back and writes.
        for item in [Item::Pairing, Item::Ratchet] {
            assert!(gate
                .run(item, |mode| {
                    assert_eq!(mode, Interaction::Silent);
                    Ok(())
                })
                .is_ok());
        }
    }

    #[test]
    fn concurrent_pairing_and_ratchet_retries_cannot_stack_dialogs() {
        let shared = std::sync::Arc::new(std::sync::Mutex::new(AccessGate::default()));
        let interactive = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let workers: Vec<_> = (0..12)
            .map(|index| {
                let shared = shared.clone();
                let interactive = interactive.clone();
                std::thread::spawn(move || {
                    let item = if index % 2 == 0 {
                        Item::Pairing
                    } else {
                        Item::Ratchet
                    };
                    for _ in 0..25 {
                        let result: Result<(), AccessError> =
                            shared.lock().unwrap().run(item, |mode| {
                                if mode == Interaction::Allow {
                                    interactive.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                                }
                                Err(AccessError::Authorization)
                            });
                        assert_eq!(result, Err(AccessError::Authorization));
                    }
                })
            })
            .collect();
        for worker in workers {
            worker.join().unwrap();
        }
        assert_eq!(interactive.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[test]
    fn missing_and_non_authentication_errors_do_not_show_dialogs() {
        let mut gate = AccessGate::default();
        assert_eq!(
            gate.run::<Option<()>>(Item::Pairing, |mode| {
                assert_eq!(mode, Interaction::Silent);
                Ok(None)
            }),
            Ok(None)
        );
        assert_eq!(
            gate.run::<()>(Item::Ratchet, |mode| {
                assert_eq!(mode, Interaction::Silent);
                Err(AccessError::Unavailable)
            }),
            Err(AccessError::Unavailable)
        );
        assert_eq!(
            AccessError::Authorization.code(),
            "secure_storage_authorization_required"
        );
    }

    #[test]
    fn denied_or_failed_lookup_never_recreates_a_credential() {
        for error in [AccessError::Authorization, AccessError::Unavailable] {
            assert!(update_or_create::<()>(
                Err(error),
                |_| panic!("must not update"),
                || panic!("must not create")
            )
            .is_err());
        }
        assert!(update_or_create(Ok(Some(())), |_| Ok(()), || panic!("must not replace")).is_ok());
        assert!(update_or_create::<()>(Ok(None), |_| panic!("must not update"), || Ok(())).is_ok());
    }
}
