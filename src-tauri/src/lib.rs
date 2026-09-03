use serde::Serialize;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PresenceSignal { idle_seconds: u64, locked: bool, app_class: &'static str }

// Safe fallback. Platform implementations must never expose process names,
// titles, URLs, pixels, or input content to the webview.
#[tauri::command]
fn presence_signal() -> PresenceSignal {
    PresenceSignal { idle_seconds: 0, locked: false, app_class: "unknown" }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default().invoke_handler(tauri::generate_handler![presence_signal]).run(tauri::generate_context!()).expect("error while running MewLink");
}
