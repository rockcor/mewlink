//! Whether a video or music is playing, for the speaker on the pup's desk.
//! Only that one bit leaves this module: never what plays, which app plays
//! it, or any sound. Only browsers and media players count: a call has the
//! headset, and games and the like keep the output open in silence.
//!
//! macOS: the processes Core Audio is running output for (macOS 14.2 and
//! later; no capture and no permission). Windows: each audio session's peak
//! meter, its level only.
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

static PLAYING: AtomicBool = AtomicBool::new(false);

/// Heard for a few seconds before it counts, and silent for a few before it
/// stops: a notification sound is not music, a gap between songs still is.
const ON_AFTER: Duration = Duration::from_secs(3);
const OFF_AFTER: Duration = Duration::from_secs(5);
#[cfg(any(target_os = "macos", target_os = "windows"))]
const POLL: Duration = Duration::from_secs(1);

#[derive(Default)]
struct Steady {
    playing: bool,
    since: Option<Instant>,
}

impl Steady {
    fn update(&mut self, heard: bool, now: Instant) -> bool {
        if heard == self.playing {
            self.since = None;
            return self.playing;
        }
        let since = *self.since.get_or_insert(now);
        if now.duration_since(since) >= if heard { ON_AFTER } else { OFF_AFTER } {
            self.playing = heard;
            self.since = None;
        }
        self.playing
    }
}

pub fn playing() -> bool {
    PLAYING.load(Ordering::Relaxed)
}

pub fn start_monitor() {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    let _ = std::thread::Builder::new()
        .name("mewlink-audio".into())
        .spawn(|| {
            platform::prepare();
            let mut steady = Steady::default();
            loop {
                let playing = steady.update(platform::heard(), Instant::now());
                PLAYING.store(playing, Ordering::Relaxed);
                std::thread::sleep(POLL);
            }
        });
}

#[cfg(any(target_os = "macos", target_os = "windows", test))]
fn counts(app: &str) -> bool {
    matches!(crate::classify_foreground_app(app), "media" | "browser")
        // Safari plays through WebKit's shared GPU process.
        || app.to_ascii_lowercase().contains("com.apple.webkit.gpu")
}

#[cfg(target_os = "macos")]
mod platform {
    use objc2::rc::Retained;
    use objc2_foundation::NSString;
    use std::ffi::c_void;
    use std::mem::size_of;
    use std::ptr::null;

    const fn code(value: &[u8; 4]) -> u32 {
        u32::from_be_bytes(*value)
    }
    const SYSTEM_OBJECT: u32 = 1;
    const GLOBAL: u32 = code(b"glob");
    const OUTPUT: u32 = code(b"outp");
    const MAIN: u32 = 0;
    const DEFAULT_OUTPUT_DEVICE: u32 = code(b"dOut");
    const DEVICE_MUTE: u32 = code(b"mute");
    const PROCESS_OBJECT_LIST: u32 = code(b"prs#");
    const PROCESS_RUNNING_OUTPUT: u32 = code(b"piro");
    const PROCESS_BUNDLE_ID: u32 = code(b"pbid");

    #[repr(C)]
    struct Address {
        selector: u32,
        scope: u32,
        element: u32,
    }

    #[allow(non_snake_case)]
    #[link(name = "CoreAudio", kind = "framework")]
    unsafe extern "C" {
        fn AudioObjectGetPropertyDataSize(
            object: u32,
            address: *const Address,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
        ) -> i32;
        fn AudioObjectGetPropertyData(
            object: u32,
            address: *const Address,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
            data: *mut c_void,
        ) -> i32;
    }

    fn read<T: Default>(object: u32, selector: u32, scope: u32) -> Option<T> {
        let address = Address {
            selector,
            scope,
            element: MAIN,
        };
        let mut value = T::default();
        let mut size = size_of::<T>() as u32;
        let status = unsafe {
            AudioObjectGetPropertyData(
                object,
                &address,
                0,
                null(),
                &mut size,
                (&mut value as *mut T).cast(),
            )
        };
        (status == 0 && size as usize == size_of::<T>()).then_some(value)
    }

    pub(super) fn prepare() {}

    pub(super) fn heard() -> bool {
        let Some(device) = read::<u32>(SYSTEM_OBJECT, DEFAULT_OUTPUT_DEVICE, GLOBAL) else {
            return false;
        };
        if read::<u32>(device, DEVICE_MUTE, OUTPUT).unwrap_or(0) != 0 {
            return false;
        }
        // Before macOS 14.2 Core Audio cannot say who plays, so nothing counts.
        processes().unwrap_or_default().into_iter().any(|process| {
            read::<u32>(process, PROCESS_RUNNING_OUTPUT, GLOBAL).unwrap_or(0) != 0
                && bundle(process).is_some_and(|id| super::counts(&id))
        })
    }

    fn processes() -> Option<Vec<u32>> {
        let address = Address {
            selector: PROCESS_OBJECT_LIST,
            scope: GLOBAL,
            element: MAIN,
        };
        let mut size = 0;
        if unsafe { AudioObjectGetPropertyDataSize(SYSTEM_OBJECT, &address, 0, null(), &mut size) }
            != 0
        {
            return None;
        }
        let mut list = vec![0_u32; size as usize / size_of::<u32>()];
        let mut size = (list.len() * size_of::<u32>()) as u32;
        let status = unsafe {
            AudioObjectGetPropertyData(
                SYSTEM_OBJECT,
                &address,
                0,
                null(),
                &mut size,
                list.as_mut_ptr().cast(),
            )
        };
        if status != 0 {
            return None;
        }
        list.truncate(size as usize / size_of::<u32>());
        Some(list)
    }

    fn bundle(process: u32) -> Option<String> {
        let reference = read::<usize>(process, PROCESS_BUNDLE_ID, GLOBAL)?;
        // A CFString the caller releases, toll-free bridged to NSString.
        let id = unsafe { Retained::from_raw(reference as *mut NSString) }?;
        Some(id.to_string())
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use windows::core::Interface;
    use windows::Win32::Foundation::S_OK;
    use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation};
    use windows::Win32::Media::Audio::{
        eConsole, eRender, AudioSessionStateActive, IAudioSessionControl2, IAudioSessionManager2,
        IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    /// Below this peak a session is silent: an open stream, a muted tab.
    const AUDIBLE: f32 = 0.001;

    pub(super) fn prepare() {
        // This thread's own COM apartment, apart from the webview's.
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    }

    pub(super) fn heard() -> bool {
        sessions().unwrap_or(false)
    }

    fn sessions() -> windows::core::Result<bool> {
        unsafe {
            let devices: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = devices.GetDefaultAudioEndpoint(eRender, eConsole)?;
            if device
                .Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)?
                .GetMute()?
                .as_bool()
            {
                return Ok(false);
            }
            let sessions = device
                .Activate::<IAudioSessionManager2>(CLSCTX_ALL, None)?
                .GetSessionEnumerator()?;
            for index in 0..sessions.GetCount()? {
                let Ok(session) = sessions.GetSession(index) else {
                    continue;
                };
                if session.GetState().ok() != Some(AudioSessionStateActive) {
                    continue;
                }
                let Ok(control) = session.cast::<IAudioSessionControl2>() else {
                    continue;
                };
                if control.IsSystemSoundsSession() == S_OK {
                    continue;
                }
                let Ok(process) = control.GetProcessId() else {
                    continue;
                };
                if process == std::process::id()
                    || !crate::platform::process_image(process)
                        .is_some_and(|path| super::counts(&path))
                {
                    continue;
                }
                let Ok(meter) = session.cast::<IAudioMeterInformation>() else {
                    continue;
                };
                if meter.GetPeakValue().unwrap_or(0.0) > AUDIBLE {
                    return Ok(true);
                }
            }
            Ok(false)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_few_seconds_of_sound_count_and_a_short_pause_does_not_stop_it() {
        let start = Instant::now();
        let at = |seconds: u64| start + Duration::from_secs(seconds);
        let mut steady = Steady::default();
        // A notification: two seconds, then quiet.
        assert!(!steady.update(true, at(0)));
        assert!(!steady.update(true, at(2)));
        assert!(!steady.update(false, at(3)));
        // A video: on after three seconds of sound.
        assert!(!steady.update(true, at(10)));
        assert!(steady.update(true, at(13)));
        // A gap between songs keeps it on; a real stop ends it.
        assert!(steady.update(false, at(20)));
        assert!(steady.update(false, at(24)));
        assert!(steady.update(true, at(25)));
        assert!(steady.update(false, at(30)));
        assert!(!steady.update(false, at(35)));
    }

    #[test]
    fn only_browsers_and_media_players_count() {
        for app in [
            "com.google.Chrome.helper",
            "com.apple.WebKit.GPU",
            "com.spotify.client",
            "com.netease.163music",
            "com.tencent.QQMusicMac",
            r"C:\Program Files\Mozilla Firefox\firefox.exe",
            r"C:\Program Files\bilibili\哔哩哔哩.exe",
        ] {
            assert!(counts(app), "{app}");
        }
        for app in [
            "us.zoom.xos",
            "com.apple.FaceTime",
            "com.tencent.xinWeChat",
            "com.DefaultCompany.DeskBird",
            "",
        ] {
            assert!(!counts(app), "{app}");
        }
    }
}
