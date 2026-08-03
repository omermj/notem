//! Application settings persisted in the platform config directory.

use std::fs;

use serde::{de::Deserializer, Deserialize, Serialize};
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

fn default_update_check_preference() -> UpdateCheckPreference {
    UpdateCheckPreference::Unset
}

fn is_ascii_digit(value: u8) -> bool {
    value.is_ascii_digit()
}

fn two_digits(value: &[u8], offset: usize) -> Option<u8> {
    let first = *value.get(offset)?;
    let second = *value.get(offset + 1)?;
    if !is_ascii_digit(first) || !is_ascii_digit(second) {
        return None;
    }
    Some((first - b'0') * 10 + second - b'0')
}

fn four_digits(value: &[u8]) -> Option<u16> {
    if value.len() < 4 || !value[..4].iter().all(|byte| is_ascii_digit(*byte)) {
        return None;
    }
    Some(
        value[..4]
            .iter()
            .fold(0, |year, byte| year * 10 + u16::from(byte - b'0')),
    )
}

fn is_leap_year(year: u16) -> bool {
    year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400))
}

fn is_valid_timestamp(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() < 20
        || !bytes[..4].iter().all(|byte| is_ascii_digit(*byte))
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !matches!(bytes[10], b'T' | b't')
        || bytes[13] != b':'
        || bytes[16] != b':'
    {
        return false;
    }

    let (Some(year), Some(month), Some(day), Some(hour), Some(minute), Some(second)) = (
        four_digits(bytes),
        two_digits(bytes, 5),
        two_digits(bytes, 8),
        two_digits(bytes, 11),
        two_digits(bytes, 14),
        two_digits(bytes, 17),
    ) else {
        return false;
    };
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => return false,
    };
    if day == 0 || day > days_in_month || hour > 23 || minute > 59 || second > 60 {
        return false;
    }

    let mut offset = 19;
    if bytes[offset] == b'.' {
        offset += 1;
        let fraction_start = offset;
        while bytes.get(offset).is_some_and(|byte| is_ascii_digit(*byte)) {
            offset += 1;
        }
        if offset == fraction_start {
            return false;
        }
    }

    if bytes.get(offset) == Some(&b'Z') || bytes.get(offset) == Some(&b'z') {
        return offset + 1 == bytes.len();
    }

    if !matches!(bytes.get(offset), Some(b'+') | Some(b'-'))
        || bytes.get(offset + 3) != Some(&b':')
        || offset + 6 != bytes.len()
    {
        return false;
    }

    matches!(two_digits(bytes, offset + 1), Some(0..=23))
        && matches!(two_digits(bytes, offset + 4), Some(0..=59))
}

fn deserialize_update_check_preference<'de, D>(
    deserializer: D,
) -> Result<UpdateCheckPreference, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(match value.as_str() {
        Some("automatic") => UpdateCheckPreference::Automatic,
        Some("manual") => UpdateCheckPreference::Manual,
        _ => UpdateCheckPreference::Unset,
    })
}

fn deserialize_timestamp<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(value
        .as_str()
        .and_then(|value| is_valid_timestamp(value).then(|| value.to_owned())))
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdateCheckPreference {
    Unset,
    Automatic,
    Manual,
}

impl Default for UpdateCheckPreference {
    fn default() -> Self {
        default_update_check_preference()
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
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
    #[serde(
        default = "default_update_check_preference",
        deserialize_with = "deserialize_update_check_preference"
    )]
    pub update_check_preference: UpdateCheckPreference,
    #[serde(default, deserialize_with = "deserialize_timestamp")]
    pub last_automatic_update_attempt_at: Option<String>,
    #[serde(default, deserialize_with = "deserialize_timestamp")]
    pub last_successful_update_check_at: Option<String>,
    #[serde(default)]
    pub dismissed_update_version: Option<String>,
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
            update_check_preference: default_update_check_preference(),
            last_automatic_update_attempt_at: None,
            last_successful_update_check_at: None,
            dismissed_update_version: None,
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
    use super::{default_editor_font, AppSettings, UpdateCheckPreference};

    #[test]
    fn missing_editor_font_uses_default() {
        let settings: AppSettings =
            serde_json::from_str(r#"{"lastVault":null}"#).expect("settings should deserialize");

        assert_eq!(settings.editor_font, default_editor_font());
    }

    #[test]
    fn old_settings_file_uses_updater_defaults() {
        let settings: AppSettings = serde_json::from_str(
            r##"{
                "lastVault": "/notes",
                "theme": "dark",
                "editorFontSize": 16,
                "editorFont": "default",
                "readableLineLength": true,
                "editorLineWidth": 82,
                "spellcheck": true,
                "highlightActiveLine": true,
                "accentColor": "#6657d9",
                "dailyNotesFolder": "Daily/",
                "dailyNoteDateFormat": "YYYY-MM-DD",
                "dailyNoteTemplate": null,
                "templatesFolder": "Templates/",
                "hotkeys": {}
            }"##,
        )
        .expect("old settings should deserialize");

        assert_eq!(
            settings.update_check_preference,
            UpdateCheckPreference::Unset
        );
        assert_eq!(settings.last_automatic_update_attempt_at, None);
        assert_eq!(settings.last_successful_update_check_at, None);
        assert_eq!(settings.dismissed_update_version, None);
    }

    #[test]
    fn partially_populated_settings_preserve_valid_updater_values() {
        let settings: AppSettings = serde_json::from_str(
            r#"{
                "updateCheckPreference": "manual",
                "lastAutomaticUpdateAttemptAt": "2026-08-02T12:30:00.000Z",
                "lastSuccessfulUpdateCheckAt": "2026-08-02T12:31:00+00:00",
                "dismissedUpdateVersion": "1.2.3"
            }"#,
        )
        .expect("partial settings should deserialize");

        assert_eq!(
            settings.update_check_preference,
            UpdateCheckPreference::Manual
        );
        assert_eq!(
            settings.last_automatic_update_attempt_at.as_deref(),
            Some("2026-08-02T12:30:00.000Z")
        );
        assert_eq!(
            settings.last_successful_update_check_at.as_deref(),
            Some("2026-08-02T12:31:00+00:00")
        );
        assert_eq!(settings.dismissed_update_version.as_deref(), Some("1.2.3"));
    }

    #[test]
    fn malformed_timestamps_and_preference_safely_use_defaults() {
        let settings: AppSettings = serde_json::from_str(
            r#"{
                "updateCheckPreference": "sometimes",
                "lastAutomaticUpdateAttemptAt": "yesterday",
                "lastSuccessfulUpdateCheckAt": "2026-02-31T12:00:00Z"
            }"#,
        )
        .expect("malformed updater values should be ignored");

        assert_eq!(
            settings.update_check_preference,
            UpdateCheckPreference::Unset
        );
        assert_eq!(settings.last_automatic_update_attempt_at, None);
        assert_eq!(settings.last_successful_update_check_at, None);
    }
}
