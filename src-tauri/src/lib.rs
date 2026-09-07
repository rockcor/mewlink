use serde::Serialize;
use tauri::{Manager, PhysicalPosition};

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct PresenceSignal {
    idle_seconds: u64,
    locked: bool,
    app_class: &'static str,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct InputSignal {
    keyboard_sequence: u64,
    pointer_sequence: u64,
    pointer_click_sequence: u64,
    recent_kind: &'static str,
}

fn classify_foreground_app(value: &str) -> &'static str {
    let app = value.to_ascii_lowercase();
    let contains = |candidates: &[&str]| candidates.iter().any(|candidate| app.contains(candidate));

    if contains(&[
        "zoom",
        "microsoft.teams",
        "ms-teams",
        "webex",
        "facetime",
        "gotomeeting",
        "wemeet",
        "tencent.meeting",
        "voovmeeting",
        "bluejeans",
        "ringcentral",
        "amazon chime",
        "chime.exe",
        "skype",
        "google meet",
        "meet.google",
        "jitsi meet",
        "around.co",
        "around.exe",
    ]) {
        "meeting"
    } else if contains(&[
        "vlc",
        "quicktime",
        "iina",
        "tv.plex",
        "plex media player",
        "plexamp",
        "plex.exe",
        "infuse",
        "mpv",
        "movist",
        "elmedia",
        "potplayer",
        "wmplayer",
        "video.ui",
        "apple.tv",
        "spotify",
        "apple.music",
        "music.exe",
        "apple.podcasts",
        "audible",
        "tidal",
        "deezer",
    ]) {
        "media"
    } else if contains(&[
        "com.openai.codex",
        "codex.app",
        "codex.exe",
        "com.openai.chat",
        "chatgpt",
        "anthropic.claude",
        "claudefordesktop",
        "claude.app",
        "claude.exe",
        "cowork",
        "microsoft.copilot",
        "copilot.app",
        "copilot.exe",
        "perplexity",
        "poe.app",
        "poe.exe",
        "google gemini",
        "notebooklm",
        "deepseek",
        "doubao",
        "kimi.app",
        "kimi.exe",
        "yuanbao",
        "cherry studio",
        "cherrystudio",
        "chatbox",
        "lm studio",
        "lmstudio",
        "msty",
        "jan.ai",
        "jan.exe",
        "anythingllm",
        "open webui",
        "openwebui",
        "lobechat",
        "ollama",
    ]) {
        "ai"
    } else if contains(&[
        "vscode",
        "visual studio code",
        "code.exe",
        "visualstudio",
        "devenv.exe",
        "cursor",
        "xcode",
        "jetbrains",
        "intellij",
        "pycharm",
        "webstorm",
        "phpstorm",
        "clion",
        "goland",
        "rubymine",
        "datagrip",
        "rustrover",
        "jetbrains.fleet",
        "android studio",
        "zed",
        "sublime",
        "eclipse",
        "netbeans",
        "rstudio",
        "positron",
        "jupyterlab",
        "jupyter notebook",
        "neovim",
        "nvim",
        "macvim",
        "emacs",
        "terminal",
        "windowsterminal",
        "iterm",
        "warp",
        "wezterm",
        "alacritty",
        "hyper.app",
        "zeit.hyper",
        "kitty.app",
        "kovidgoyal.kitty",
        "powershell",
        "github desktop",
        "github.githubclient",
        "sourcetree",
        "tower.app",
        "fournova.tower",
        "fork.app",
        "danpristupov.fork",
        "dbeaver",
        "tableplus",
        "postman",
        "insomnia",
        "docker desktop",
    ]) {
        "editor"
    } else if contains(&[
        "preview",
        "acrobat",
        "pdfexpert",
        "pdf expert",
        "skim.app",
        "pdf",
        "books",
        "microsoft.word",
        "word.exe",
        "microsoft.excel",
        "excel.exe",
        "microsoft.powerpoint",
        "powerpnt.exe",
        "microsoft.onenote",
        "onenote.exe",
        "pages",
        "numbers",
        "keynote",
        "libreoffice",
        "soffice",
        "openoffice",
        "onlyoffice",
        "wpsoffice",
        "kingsoft.wps",
        "com.apple.notes",
        "apple.notes",
        "notes.exe",
        "com.apple.mail",
        "com.apple.ical",
        "com.apple.reminders",
        "thunderbird",
        "airmail",
        "readdle.smartemail",
        "superhuman",
        "fantastical",
        "microsoft.outlook",
        "outlook",
        "obsidian",
        "notion",
        "craft.do",
        "craft.exe",
        "bear.app",
        "shinyfrog.bear",
        "ulysses",
        "typora",
        "ia writer",
        "zotero",
        "mendeley",
        "endnote",
        "readwise",
        "slack",
        "discord",
        "larksuite",
        "bytedance.ee.lark",
        "feishu",
        "dingtalk",
        "tencent.wework",
        "wecom",
        "linear.app",
        "com.linear",
        "linear.exe",
        "todoist",
        "ticktick",
        "thingsmac",
        "omnifocus",
        "clickup",
        "asana",
        "trello",
        "monday.com",
        "miro",
        "whimsical",
        "draw.io",
        "diagrams.net",
        "xmind",
        "mindnode",
        "figma",
        "sketch.app",
        "bohemiancoding.sketch",
        "photoshop",
        "illustrator",
        "indesign",
        "affinity designer",
        "affinity photo",
        "affinity publisher",
        "adobe xd",
        "canva",
        "final cut pro",
        "davinci resolve",
        "adobe premiere",
        "after effects",
        "blender",
    ]) {
        "reader"
    } else if contains(&[
        "chrome",
        "chromium",
        "safari",
        "firefox",
        "waterfox",
        "librewolf",
        "floorp",
        "msedge",
        "microsoft edge",
        "microsoft.edgemac",
        "arc.app",
        "company.thebrowser.browser",
        "brave",
        "opera",
        "vivaldi",
        "orion",
        "sigmaos",
        "sidekick",
        "thebrowser.dia",
        "perplexity.comet",
        "duckduckgo.macos.browser",
        "zen browser",
        "yandex.browser",
    ]) {
        "browser"
    } else {
        "unknown"
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{classify_foreground_app, InputSignal, PresenceSignal};
    use objc2_app_kit::NSWorkspace;
    use std::ffi::{c_char, c_void};

    const COMBINED_SESSION_STATE: i32 = 0;
    const ANY_INPUT_EVENT_TYPE: u32 = u32::MAX;
    const LEFT_MOUSE_DOWN: u32 = 1;
    const RIGHT_MOUSE_DOWN: u32 = 3;
    const MOUSE_MOVED: u32 = 5;
    const LEFT_MOUSE_DRAGGED: u32 = 6;
    const RIGHT_MOUSE_DRAGGED: u32 = 7;
    const KEY_DOWN: u32 = 10;
    const FLAGS_CHANGED: u32 = 12;
    const SCROLL_WHEEL: u32 = 22;
    const OTHER_MOUSE_DOWN: u32 = 25;
    const OTHER_MOUSE_DRAGGED: u32 = 27;
    const UTF8_ENCODING: u32 = 0x0800_0100;
    const LOCK_KEY: &[u8] = b"CGSSessionScreenIsLocked\0";

    #[allow(non_snake_case)]
    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state_id: i32, event_type: u32) -> f64;
        fn CGEventSourceCounterForEventType(state_id: i32, event_type: u32) -> u32;
        fn CGSessionCopyCurrentDictionary() -> *const c_void;
    }

    #[allow(non_snake_case)]
    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFStringCreateWithCString(
            allocator: *const c_void,
            value: *const c_char,
            encoding: u32,
        ) -> *const c_void;
        fn CFDictionaryGetValue(dictionary: *const c_void, key: *const c_void) -> *const c_void;
        fn CFBooleanGetTypeID() -> usize;
        fn CFBooleanGetValue(value: *const c_void) -> u8;
        fn CFGetTypeID(value: *const c_void) -> usize;
        fn CFRelease(value: *const c_void);
    }

    pub(super) fn sample() -> PresenceSignal {
        // Reads only the elapsed duration since input, never the input itself.
        let idle = unsafe {
            CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION_STATE, ANY_INPUT_EVENT_TYPE)
        };
        PresenceSignal {
            idle_seconds: finite_seconds(idle),
            locked: session_is_locked(),
            app_class: foreground_app_class(),
        }
    }

    pub(super) fn input_sample() -> InputSignal {
        // Only monotonic event counts and recency cross into the webview. Key values,
        // pointer coordinates, window titles, and gesture content are never read.
        InputSignal {
            keyboard_sequence: event_count(&[KEY_DOWN, FLAGS_CHANGED]),
            pointer_sequence: event_count(&[
                LEFT_MOUSE_DOWN,
                RIGHT_MOUSE_DOWN,
                MOUSE_MOVED,
                LEFT_MOUSE_DRAGGED,
                RIGHT_MOUSE_DRAGGED,
                SCROLL_WHEEL,
                OTHER_MOUSE_DOWN,
                OTHER_MOUSE_DRAGGED,
            ]),
            pointer_click_sequence: event_count(&[
                LEFT_MOUSE_DOWN,
                RIGHT_MOUSE_DOWN,
                OTHER_MOUSE_DOWN,
            ]),
            recent_kind: recent_input_kind(),
        }
    }

    fn foreground_app_class() -> &'static str {
        let workspace = NSWorkspace::sharedWorkspace();
        let Some(application) = workspace.frontmostApplication() else {
            return "unknown";
        };
        let identifier = application
            .bundleIdentifier()
            .map(|value| value.to_string())
            .unwrap_or_default();
        let name = application
            .localizedName()
            .map(|value| value.to_string())
            .unwrap_or_default();
        classify_foreground_app(&format!("{identifier} {name}"))
    }

    fn seconds_since(event_type: u32) -> f64 {
        unsafe { CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION_STATE, event_type) }
    }

    fn most_recent(events: &[u32]) -> f64 {
        events
            .iter()
            .map(|event| seconds_since(*event))
            .filter(|seconds| seconds.is_finite() && *seconds >= 0.0)
            .fold(f64::INFINITY, f64::min)
    }

    fn event_count(events: &[u32]) -> u64 {
        events
            .iter()
            .map(|event| unsafe {
                u64::from(CGEventSourceCounterForEventType(
                    COMBINED_SESSION_STATE,
                    *event,
                ))
            })
            .sum()
    }

    fn recent_input_kind() -> &'static str {
        // Only event timing is read. Key values, pointer coordinates, and gesture content are not.
        let keyboard = most_recent(&[KEY_DOWN, FLAGS_CHANGED]);
        let pointer = most_recent(&[
            LEFT_MOUSE_DOWN,
            RIGHT_MOUSE_DOWN,
            MOUSE_MOVED,
            LEFT_MOUSE_DRAGGED,
            RIGHT_MOUSE_DRAGGED,
            SCROLL_WHEEL,
            OTHER_MOUSE_DOWN,
            OTHER_MOUSE_DRAGGED,
        ]);
        if keyboard <= 0.9 && keyboard <= pointer {
            "keyboard"
        } else if pointer <= 0.9 {
            "pointer"
        } else {
            "none"
        }
    }

    fn finite_seconds(seconds: f64) -> u64 {
        if seconds.is_finite() && seconds > 0.0 {
            seconds.min(u64::MAX as f64) as u64
        } else {
            0
        }
    }

    fn session_is_locked() -> bool {
        // The session dictionary contains state flags only. No window titles,
        // application names, URLs, pixels, or input content are accessed.
        unsafe {
            let dictionary = CGSessionCopyCurrentDictionary();
            if dictionary.is_null() {
                return true;
            }

            let key = CFStringCreateWithCString(
                std::ptr::null(),
                LOCK_KEY.as_ptr().cast(),
                UTF8_ENCODING,
            );
            if key.is_null() {
                CFRelease(dictionary);
                return true;
            }

            let value = CFDictionaryGetValue(dictionary, key);
            let locked = !value.is_null()
                && CFGetTypeID(value) == CFBooleanGetTypeID()
                && CFBooleanGetValue(value) != 0;
            CFRelease(key);
            CFRelease(dictionary);
            locked
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn invalid_idle_values_are_private_safe_zeroes() {
            assert_eq!(finite_seconds(f64::NAN), 0);
            assert_eq!(finite_seconds(-1.0), 0);
            assert_eq!(finite_seconds(2.9), 2);
        }

        #[test]
        fn reads_a_real_session_signal() {
            let signal = sample();
            assert!(
                ["editor", "reader", "meeting", "media", "browser", "ai", "unknown"]
                    .contains(&signal.app_class)
            );
            assert!(signal.idle_seconds < u64::MAX);
        }

        #[test]
        fn reads_only_coarse_input_counters() {
            let signal = input_sample();
            assert!(["keyboard", "pointer", "none"].contains(&signal.recent_kind));
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{classify_foreground_app, InputSignal, PresenceSignal};
    use std::mem::size_of;
    use std::sync::atomic::{AtomicU64, Ordering};
    use windows_sys::Win32::Foundation::{CloseHandle, POINT};
    use windows_sys::Win32::System::StationsAndDesktops::{
        CloseDesktop, OpenInputDesktop, SwitchDesktop, DESKTOP_SWITCHDESKTOP,
    };
    use windows_sys::Win32::System::SystemInformation::GetTickCount64;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, GetLastInputInfo, LASTINPUTINFO, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetForegroundWindow, GetWindowThreadProcessId,
    };

    static LAST_CURSOR: AtomicU64 = AtomicU64::new(u64::MAX);
    static LAST_INPUT_TICK: AtomicU64 = AtomicU64::new(u64::MAX);
    static KEYBOARD_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    static POINTER_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    static POINTER_CLICK_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    static LAST_POINTER_BUTTONS: AtomicU64 = AtomicU64::new(0);

    pub(super) fn sample() -> PresenceSignal {
        let (idle_seconds, _) = input_state();
        PresenceSignal {
            idle_seconds,
            locked: session_is_locked(),
            app_class: foreground_app_class(),
        }
    }

    pub(super) fn input_sample() -> InputSignal {
        let (idle_seconds, input_tick) = input_state();
        let (pointer_buttons, pointer_presses) = pointer_button_state();
        let previous_buttons = LAST_POINTER_BUTTONS.swap(pointer_buttons, Ordering::Relaxed);
        let fresh_clicks = ((pointer_buttons & !previous_buttons) | pointer_presses).count_ones();
        if fresh_clicks > 0 {
            POINTER_CLICK_SEQUENCE.fetch_add(u64::from(fresh_clicks), Ordering::Relaxed);
        }
        let recent_kind = recent_input_kind(input_tick, idle_seconds, pointer_buttons != 0);
        match recent_kind {
            "keyboard" => {
                KEYBOARD_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            }
            "pointer" => {
                POINTER_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            }
            _ => {}
        }
        InputSignal {
            keyboard_sequence: KEYBOARD_SEQUENCE.load(Ordering::Relaxed),
            pointer_sequence: POINTER_SEQUENCE.load(Ordering::Relaxed),
            pointer_click_sequence: POINTER_CLICK_SEQUENCE.load(Ordering::Relaxed),
            recent_kind,
        }
    }

    fn foreground_app_class() -> &'static str {
        unsafe {
            let window = GetForegroundWindow();
            if window.is_null() {
                return "unknown";
            }
            let mut process_id = 0;
            GetWindowThreadProcessId(window, &mut process_id);
            if process_id == 0 {
                return "unknown";
            }
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
            if process.is_null() {
                return "unknown";
            }
            let mut buffer = [0_u16; 1024];
            let mut length = buffer.len() as u32;
            let ok = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut length) != 0;
            CloseHandle(process);
            if !ok {
                return "unknown";
            }
            classify_foreground_app(&String::from_utf16_lossy(&buffer[..length as usize]))
        }
    }

    fn recent_input_kind(
        input_tick: u64,
        idle_seconds: u64,
        pointer_button_down: bool,
    ) -> &'static str {
        if idle_seconds > 2 {
            return "none";
        }
        let mut cursor = POINT { x: 0, y: 0 };
        let packed_cursor = if unsafe { GetCursorPos(&mut cursor) } != 0 {
            ((cursor.x as u32 as u64) << 32) | cursor.y as u32 as u64
        } else {
            u64::MAX
        };
        let previous_cursor = LAST_CURSOR.swap(packed_cursor, Ordering::Relaxed);
        let previous_tick = LAST_INPUT_TICK.swap(input_tick, Ordering::Relaxed);
        if packed_cursor != u64::MAX
            && previous_cursor != u64::MAX
            && packed_cursor != previous_cursor
        {
            "pointer"
        } else if previous_tick != u64::MAX && input_tick != previous_tick && pointer_button_down {
            "pointer"
        } else if previous_tick != u64::MAX && input_tick != previous_tick {
            // A fresh non-pointer event is treated as keyboard/trackpad activity; content is unknown.
            "keyboard"
        } else {
            "none"
        }
    }

    fn pointer_button_state() -> (u64, u64) {
        let keys = [VK_LBUTTON, VK_RBUTTON, VK_MBUTTON];
        keys.iter()
            .enumerate()
            .fold((0, 0), |(down, pressed), (index, key)| {
                let state = unsafe { GetAsyncKeyState(*key as i32) } as u16;
                let bit = 1_u64 << index;
                (
                    if state & 0x8000 != 0 {
                        down | bit
                    } else {
                        down
                    },
                    if state & 0x0001 != 0 {
                        pressed | bit
                    } else {
                        pressed
                    },
                )
            })
    }

    fn input_state() -> (u64, u64) {
        let mut last_input = LASTINPUTINFO {
            cbSize: size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if unsafe { GetLastInputInfo(&mut last_input) } == 0 {
            return (0, 0);
        }

        let now = unsafe { GetTickCount64() } as u32;
        (
            u64::from(now.wrapping_sub(last_input.dwTime)) / 1_000,
            u64::from(last_input.dwTime),
        )
    }

    fn session_is_locked() -> bool {
        unsafe {
            let desktop = OpenInputDesktop(0, 0, DESKTOP_SWITCHDESKTOP);
            if desktop.is_null() {
                return true;
            }
            let unlocked = SwitchDesktop(desktop) != 0;
            CloseDesktop(desktop);
            !unlocked
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use super::{InputSignal, PresenceSignal};

    pub(super) fn sample() -> PresenceSignal {
        PresenceSignal {
            idle_seconds: 0,
            locked: false,
            app_class: "unknown",
        }
    }

    pub(super) fn input_sample() -> InputSignal {
        InputSignal {
            keyboard_sequence: 0,
            pointer_sequence: 0,
            pointer_click_sequence: 0,
            recent_kind: "none",
        }
    }
}

#[cfg(test)]
mod classification_tests {
    use super::classify_foreground_app;

    #[test]
    fn classifies_code_apps_as_the_code_work_visual() {
        for app in [
            "com.microsoft.VSCode",
            r"C:\\Program Files\\Microsoft VS Code\\Code.exe",
            "com.todesktop.230313mzl4w4u92 Cursor",
            "com.apple.dt.Xcode",
            "com.jetbrains.intellij",
            "com.jetbrains.rustrover",
            "dev.zed.Zed",
            "com.microsoft.WindowsTerminal_8wekyb3d8bbwe",
            "com.postmanlabs.mac Postman",
        ] {
            assert_eq!(classify_foreground_app(app), "editor", "{app}");
        }
    }

    #[test]
    fn classifies_general_ai_apps_as_the_ai_work_visual() {
        for app in [
            "com.openai.codex Codex",
            "com.openai.chat ChatGPT",
            "com.anthropic.claudefordesktop Claude",
            "com.anthropic.claudefordesktop Cowork",
            "com.microsoft.copilot Copilot",
            "ai.perplexity.mac Perplexity",
            "com.openai.chatbox Chatbox",
            "com.cherryai.cherrystudio CherryStudio",
        ] {
            assert_eq!(classify_foreground_app(app), "ai", "{app}");
        }
    }

    #[test]
    fn classifies_document_and_collaboration_apps_as_the_document_work_visual() {
        for app in [
            "com.apple.Preview",
            "com.apple.Notes",
            "com.microsoft.Outlook",
            r"C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
            "md.obsidian",
            "notion.id",
            "com.tinyspeck.slackmacgap Slack",
            "com.larksuite.suite Lark",
            "com.alibaba.DingTalkMac DingTalk",
            "com.tencent.WeWorkMac WeCom",
            "com.figma.Desktop Figma",
            "com.bohemiancoding.sketch3 Sketch",
            "com.adobe.Photoshop Photoshop",
            "com.apple.iCal Calendar",
            "net.shinyfrog.bear Bear",
        ] {
            assert_eq!(classify_foreground_app(app), "reader", "{app}");
        }
    }

    #[test]
    fn classifies_browsers_as_the_web_work_visual() {
        for app in [
            "com.apple.Safari",
            "com.google.Chrome",
            "org.mozilla.firefox",
            "com.microsoft.edgemac",
            "company.thebrowser.Browser Arc",
            "com.brave.Browser",
            "com.vivaldi.Vivaldi",
            "company.thebrowser.dia Dia",
        ] {
            assert_eq!(classify_foreground_app(app), "browser", "{app}");
        }
    }

    #[test]
    fn keeps_meetings_and_leisure_outside_the_work_visuals() {
        for app in [
            "us.zoom.xos",
            "com.microsoft.teams2",
            "com.tencent.meeting Wemeet",
            "com.cisco.webexmeetingsapp",
            "com.google.Chrome.app.meet Google Meet",
        ] {
            assert_eq!(classify_foreground_app(app), "meeting", "{app}");
        }
        for app in [
            "com.apple.QuickTimePlayerX",
            "com.colliderli.iina",
            "org.videolan.vlc",
            "com.spotify.client Spotify",
        ] {
            assert_eq!(classify_foreground_app(app), "media", "{app}");
        }
    }

    #[test]
    fn leaves_unlisted_apps_unknown() {
        assert_eq!(classify_foreground_app("com.example.UnlistedApp"), "unknown");
    }
}

// Only coarse presence data crosses the command boundary.
#[tauri::command]
fn presence_signal() -> PresenceSignal {
    platform::sample()
}

#[tauri::command]
fn input_signal() -> InputSignal {
    platform::input_sample()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![presence_signal, input_signal])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Some(monitor) = window.current_monitor()? {
                    let work_area = monitor.work_area();
                    let window_size = window.outer_size()?;
                    let margin = 16;
                    let right = work_area.position.x + work_area.size.width as i32;
                    let bottom = work_area.position.y + work_area.size.height as i32;
                    let x = (right - window_size.width as i32 - margin).max(work_area.position.x);
                    let y = (bottom - window_size.height as i32 - margin).max(work_area.position.y);
                    window.set_position(PhysicalPosition::new(x, y))?;
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MewLink");
}
