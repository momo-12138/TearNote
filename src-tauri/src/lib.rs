use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use serde::Serialize;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

fn get_dir() -> PathBuf {
    let dir = env::temp_dir().join("tearnote_stickers");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

#[tauri::command]
fn save_note(id: String, content: String) {
    let _ = fs::write(get_dir().join(format!("{}.md", id)), content);
}

#[tauri::command]
fn delete_note(id: String) {
    let _ = fs::remove_file(get_dir().join(format!("{}.md", id)));
}

#[tauri::command]
fn load_note(id: String) -> String {
    fs::read_to_string(get_dir().join(format!("{}.md", id))).unwrap_or_default()
}

#[tauri::command]
fn get_all_notes() -> Vec<String> {
    let mut notes = Vec::new();
    if let Ok(entries) = fs::read_dir(get_dir()) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.ends_with(".md") {
                    notes.push(name.replace(".md", ""));
                }
            }
        }
    }
    notes
}

#[tauri::command]
async fn spawn_sticker(app: AppHandle, id: String, x: Option<f64>, y: Option<f64>) -> Result<(), String> {
    let label = format!("sticker_{}", id);
    if app.get_webview_window(&label).is_some() {
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(
        &app,
        label,
        WebviewUrl::App(format!("index.html?sticker=true&id={}", id).into()),
    )
    .title("tearnote")
    .inner_size(640.0, 420.0)
    .decorations(false)
    .background_color(tauri::utils::config::Color(0, 0, 0, 0))
    .always_on_top(true);

    if let (Some(px), Some(py)) = (x, y) {
        builder = builder.position(px, py);
    }

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[derive(Serialize)]
struct NotePreview {
    id: String,
    preview: String,
    updated_at: u64,
}

#[tauri::command]
fn get_notes_preview() -> Vec<NotePreview> {
    let mut notes = Vec::new();
    if let Ok(entries) = fs::read_dir(get_dir()) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = entry.file_name().to_str() {
                if name.ends_with(".md") && name != "main.md" && name != "__active_stickers__.md" {
                    let id = name.replace(".md", "");
                    let content = fs::read_to_string(&path).unwrap_or_default();
                    let clean_content = content.replace('\n', " ");
                    let preview: String = clean_content.chars().take(50).collect();

                    let updated_at = fs::metadata(&path)
                        .and_then(|m| m.modified())
                        .and_then(|t| {
                            t.duration_since(UNIX_EPOCH)
                                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
                        })
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);

                    notes.push(NotePreview {
                        id,
                        preview,
                        updated_at,
                    });
                }
            }
        }
    }
    notes
}

#[tauri::command]
fn close_sticker_window(app: AppHandle, id: String) {
    let label = format!("sticker_{}", id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.close();
    }
}

#[tauri::command]
fn save_backup_dialog(filename: String, content: String) -> Result<String, String> {
    if let Some(path) = rfd::FileDialog::new()
        .set_file_name(&filename)
        .add_filter("JSON 备份文件", &["json"])
        .save_file()
    {
        std::fs::write(&path, content).map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().to_string())
    } else {
        Err("CANCELED".to_string())
    }
}

#[tauri::command]
fn read_backup_dialog() -> Result<String, String> {
    if let Some(path) = rfd::FileDialog::new()
        .add_filter("JSON 备份文件", &["json"])
        .pick_file()
    {
        std::fs::read_to_string(&path).map_err(|e| e.to_string())
    } else {
        Err("CANCELED".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "完全退出 TearNote", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "显示主界面", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let tray_icon = app.default_window_icon().unwrap().clone();

            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .tooltip("TearNote")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_note,
            delete_note,
            load_note,
            get_all_notes,
            spawn_sticker,
            exit_app,
            get_notes_preview,
            close_sticker_window,
            save_backup_dialog,
            read_backup_dialog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
