//! Application settings persisted in the platform config directory.

use std::fs;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::{
    error::AppError,
    vault_path::{path_exists, resolve_write_file, secure_directory, write_new},
};

fn default_editor_font_size() -> u16 {
    15
}

fn default_editor_font() -> String {
    "default".into()
}

fn default_readable_line_length() -> bool {
    true
}

fn default_editor_line_width() -> u16 {
    82
}

fn default_spellcheck() -> bool {
    true
}

fn default_highlight_active_line() -> bool {
    true
}

fn default_theme() -> String {
    "system".into()
}

fn default_accent_color() -> String {
    "#6657d9".into()
}

fn default_daily_notes_folder() -> String {
    "Daily/".into()
}

fn default_daily_note_date_format() -> String {
    "YYYY-MM-DD".into()
}

fn default_templates_folder() -> String {
    "Templates/".into()
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub last_vault: Option<String>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_editor_font_size")]
    pub editor_font_size: u16,
    #[serde(default = "default_editor_font")]
    pub editor_font: String,
    #[serde(default = "default_readable_line_length")]
    pub readable_line_length: bool,
    #[serde(default = "default_editor_line_width")]
    pub editor_line_width: u16,
    #[serde(default = "default_spellcheck")]
    pub spellcheck: bool,
    #[serde(default = "default_highlight_active_line")]
    pub highlight_active_line: bool,
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
    #[serde(default = "default_daily_notes_folder")]
    pub daily_notes_folder: String,
    #[serde(default = "default_daily_note_date_format")]
    pub daily_note_date_format: String,
    #[serde(default)]
    pub daily_note_template: Option<String>,
    #[serde(default = "default_templates_folder")]
    pub templates_folder: String,
    #[serde(default)]
    pub hotkeys: std::collections::HashMap<String, String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            last_vault: None,
            theme: default_theme(),
            editor_font_size: default_editor_font_size(),
            editor_font: default_editor_font(),
            readable_line_length: default_readable_line_length(),
            editor_line_width: default_editor_line_width(),
            spellcheck: default_spellcheck(),
            highlight_active_line: default_highlight_active_line(),
            accent_color: default_accent_color(),
            daily_notes_folder: default_daily_notes_folder(),
            daily_note_date_format: default_daily_note_date_format(),
            daily_note_template: None,
            templates_folder: default_templates_folder(),
            hotkeys: std::collections::HashMap::new(),
        }
    }
}

#[tauri::command]
pub fn vault_settings_get(
    state: tauri::State<'_, crate::commands::vault::CurrentVault>,
) -> Result<serde_json::Value, AppError> {
    let root = crate::commands::vault::vault_root(&state)?;
    secure_directory(&root, std::path::Path::new(".notem"), true)?;
    let path = resolve_write_file(&root, ".notem/settings.json", false)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

#[tauri::command]
pub fn vault_settings_set(
    settings: serde_json::Value,
    state: tauri::State<'_, crate::commands::vault::CurrentVault>,
) -> Result<(), AppError> {
    let root = crate::commands::vault::vault_root(&state)?;
    secure_directory(&root, std::path::Path::new(".notem"), true)?;
    let path = resolve_write_file(&root, ".notem/settings.json", false)?;
    let content = serde_json::to_string_pretty(&settings)?;
    if path_exists(&path)? {
        fs::write(path, content)?;
    } else {
        write_new(&path, content.as_bytes())?;
    }
    Ok(())
}

#[tauri::command]
pub fn settings_get(app: AppHandle) -> Result<AppSettings, AppError> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

#[tauri::command]
pub fn settings_set(app: AppHandle, settings: AppSettings) -> Result<(), AppError> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(&settings)?)?;
    Ok(())
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|error| AppError::Message(error.to_string()))?
        .join("settings.json"))
}

#[cfg(test)]
mod tests {
    use super::{default_editor_font, AppSettings};

    #[test]
    fn missing_editor_font_uses_default() {
        let settings: AppSettings =
            serde_json::from_str(r#"{"lastVault":null}"#).expect("settings should deserialize");

        assert_eq!(settings.editor_font, default_editor_font());
    }
}
