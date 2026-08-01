use std::{
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

use crate::error::AppError;

static NEXT_WINDOW_ID: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
pub fn window_open_note(path: String, app: AppHandle) -> Result<(), AppError> {
    let lower = path.to_lowercase();
    if path.is_empty() || !(lower.ends_with(".md") || lower.ends_with(".pdf")) {
        return Err(AppError::InvalidPath(path));
    }
    let number = NEXT_WINDOW_ID.fetch_add(1, Ordering::Relaxed);
    let label = format!("note-{number}");
    let file_name = path.rsplit('/').next().unwrap_or(&path);
    let title = Path::new(file_name)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or(file_name);
    let url = format!("index.html?detached={}", urlencoding::encode(&path));
    WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into()))
        .title(format!("{title} — NoteM"))
        .inner_size(900.0, 700.0)
        .min_inner_size(700.0, 500.0)
        .build()
        .map_err(|error| AppError::Message(format!("could not open note window: {error}")))?;
    Ok(())
}
