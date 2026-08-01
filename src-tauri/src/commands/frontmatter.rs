//! Ordered YAML frontmatter reads and updates.

use std::fs;

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use serde_yaml::{Mapping, Number, Value};
use tauri::State;

use crate::{
    commands::{
        files::{modified_timestamp, resolve_existing, FileContents},
        vault::{vault_root, CurrentVault},
    },
    error::AppError,
    index::db,
};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyEntry {
    pub key: String,
    pub value_type: String,
    pub value: JsonValue,
}

#[tauri::command]
pub fn frontmatter_get(
    path: String,
    state: State<'_, CurrentVault>,
) -> Result<Vec<PropertyEntry>, AppError> {
    let root = vault_root(&state)?;
    let absolute = resolve_existing(&root, &path)?;
    let content = fs::read_to_string(absolute)?;
    let Some((yaml, _, _)) = frontmatter_parts(&content) else {
        return Ok(Vec::new());
    };
    let mapping = serde_yaml::from_str::<Mapping>(yaml)
        .map_err(|error| AppError::Message(format!("invalid YAML frontmatter: {error}")))?;
    mapping
        .into_iter()
        .filter_map(|(key, value)| key.as_str().map(|key| (key.to_owned(), value)))
        .map(|(key, value)| property_from_yaml(key, value))
        .collect()
}

#[tauri::command]
pub fn frontmatter_set(
    path: String,
    properties: Vec<PropertyEntry>,
    known_mtime: i64,
    state: State<'_, CurrentVault>,
) -> Result<FileContents, AppError> {
    let root = vault_root(&state)?;
    let absolute = resolve_existing(&root, &path)?;
    if modified_timestamp(&absolute)? > known_mtime {
        return Err(AppError::Conflict(path));
    }

    let original = fs::read_to_string(&absolute)?;
    let content = rewrite_frontmatter(&original, properties)?;
    fs::write(&absolute, &content)?;
    db::sync_paths(&root, std::slice::from_ref(&path))?;
    Ok(FileContents {
        content,
        mtime: modified_timestamp(&absolute)?,
        size: fs::metadata(&absolute)?.len(),
        kind: crate::commands::files::FileKind::Text,
        readonly: false,
        warning: None,
    })
}

fn rewrite_frontmatter(original: &str, properties: Vec<PropertyEntry>) -> Result<String, AppError> {
    let body = frontmatter_parts(original)
        .map(|(_, _, body_start)| &original[body_start..])
        .unwrap_or(original);
    let mut mapping = Mapping::new();
    for property in properties {
        let key = property.key.trim();
        if key.is_empty() {
            return Err(AppError::Message(
                "property names cannot be empty".to_owned(),
            ));
        }
        mapping.insert(Value::String(key.to_owned()), property_to_yaml(&property)?);
    }

    if mapping.is_empty() {
        Ok(body.trim_start_matches(['\r', '\n']).to_owned())
    } else {
        let yaml = serde_yaml::to_string(&mapping)
            .map_err(|error| AppError::Message(format!("could not serialize YAML: {error}")))?;
        let body = body.trim_start_matches(['\r', '\n']);
        if body.is_empty() {
            Ok(format!("---\n{yaml}---\n"))
        } else {
            Ok(format!("---\n{yaml}---\n\n{body}"))
        }
    }
}

fn frontmatter_parts(content: &str) -> Option<(&str, usize, usize)> {
    let first_end = content.find('\n')? + 1;
    if content[..first_end].trim_end_matches(['\r', '\n']) != "---" {
        return None;
    }
    let mut offset = first_end;
    for line in content[first_end..].split_inclusive('\n') {
        let end = offset + line.len();
        if line.trim_end_matches(['\r', '\n']) == "---" {
            return Some((&content[first_end..offset], offset, end));
        }
        offset = end;
    }
    None
}

fn property_from_yaml(key: String, value: Value) -> Result<PropertyEntry, AppError> {
    if key == "tags" {
        let tags: Vec<String> = match value {
            Value::Sequence(values) => values
                .into_iter()
                .filter_map(|value| scalar_text(&value))
                .collect(),
            Value::String(value) => value
                .trim_matches(['[', ']'])
                .split([',', ' '])
                .map(|tag| tag.trim().trim_start_matches('#').to_owned())
                .filter(|tag| !tag.is_empty())
                .collect(),
            value => scalar_text(&value).into_iter().collect(),
        };
        return Ok(PropertyEntry {
            key,
            value_type: "list".to_owned(),
            value: JsonValue::Array(tags.into_iter().map(JsonValue::String).collect()),
        });
    }
    let (value_type, value) = match value {
        Value::Bool(value) => ("checkbox", JsonValue::Bool(value)),
        Value::Number(value) => (
            "number",
            serde_json::to_value(value).map_err(|error| AppError::Message(error.to_string()))?,
        ),
        Value::Sequence(values) => (
            "list",
            JsonValue::Array(
                values
                    .into_iter()
                    .map(|value| {
                        scalar_text(&value)
                            .map(JsonValue::String)
                            .unwrap_or_else(|| JsonValue::String(yaml_text(&value)))
                    })
                    .collect(),
            ),
        ),
        Value::String(value) if is_iso_date(&value) => ("date", JsonValue::String(value)),
        Value::String(value) => ("text", JsonValue::String(value)),
        Value::Null => ("text", JsonValue::String(String::new())),
        value => ("text", JsonValue::String(yaml_text(&value))),
    };
    Ok(PropertyEntry {
        key,
        value_type: value_type.to_owned(),
        value,
    })
}

fn property_to_yaml(property: &PropertyEntry) -> Result<Value, AppError> {
    match property.value_type.as_str() {
        "checkbox" => Ok(Value::Bool(property.value.as_bool().unwrap_or(false))),
        "number" => {
            if let Some(value) = property.value.as_i64() {
                Ok(Value::Number(Number::from(value)))
            } else if let Some(value) = property.value.as_f64() {
                Ok(Value::Number(Number::from(value)))
            } else {
                Err(AppError::Message(format!(
                    "{} must be a number",
                    property.key
                )))
            }
        }
        "list" => Ok(Value::Sequence(
            property
                .value
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|value| Value::String(value.as_str().unwrap_or_default().to_owned()))
                .collect(),
        )),
        "date" | "text" => Ok(Value::String(
            property.value.as_str().unwrap_or_default().to_owned(),
        )),
        other => Err(AppError::Message(format!(
            "unsupported property type: {other}"
        ))),
    }
}

fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
}

fn scalar_text(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Bool(value) => Some(value.to_string()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn yaml_text(value: &Value) -> String {
    serde_yaml::to_string(value)
        .unwrap_or_default()
        .trim()
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_frontmatter_and_body_boundaries() {
        let content = "---\ntitle: Test\ntags: [one, two]\n---\n\nBody\n";
        let (yaml, _, body) = frontmatter_parts(content).expect("frontmatter");
        assert!(yaml.contains("title: Test"));
        assert_eq!(&content[body..], "\nBody\n");
    }

    #[test]
    fn maps_supported_types() {
        let entry = property_from_yaml("done".into(), Value::Bool(true)).expect("property");
        assert_eq!(entry.value_type, "checkbox");
        assert_eq!(entry.value, JsonValue::Bool(true));
    }

    #[test]
    fn rewrite_round_trips_valid_yaml_and_preserves_key_order() {
        let properties = vec![
            PropertyEntry {
                key: "title".into(),
                value_type: "text".into(),
                value: JsonValue::String("A note".into()),
            },
            PropertyEntry {
                key: "tags".into(),
                value_type: "list".into(),
                value: serde_json::json!(["one", "two"]),
            },
            PropertyEntry {
                key: "published".into(),
                value_type: "checkbox".into(),
                value: JsonValue::Bool(true),
            },
        ];
        let rewritten =
            rewrite_frontmatter("---\nold: value\n---\n\nBody stays here.\n", properties)
                .expect("rewrite");
        let (yaml, _, body_start) = frontmatter_parts(&rewritten).expect("frontmatter");
        let mapping = serde_yaml::from_str::<Mapping>(yaml).expect("valid yaml");
        let keys: Vec<&str> = mapping.keys().filter_map(Value::as_str).collect();
        assert_eq!(keys, vec!["title", "tags", "published"]);
        assert_eq!(&rewritten[body_start..], "\nBody stays here.\n");
    }
}
