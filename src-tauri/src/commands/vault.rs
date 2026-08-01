//! Vault lifecycle command handlers.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Instant,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{
    commands::performance::PerformanceState,
    error::AppError,
    index::{
        db::{self, ScanProgress},
        watcher::VaultWatcher,
    },
    vault_path::{root_is_available, secure_directory},
};

#[derive(Debug, Clone)]
pub struct VaultState {
    pub root: PathBuf,
}

#[derive(Default)]
pub struct CurrentVault(pub Mutex<Option<VaultState>>);

#[derive(Default)]
pub struct CurrentWatcher(pub Mutex<Option<VaultWatcher>>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultInfo {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    pub name: String,
    pub path: String,
    pub kind: EntryKind,
    pub children: Vec<VaultEntry>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Folder,
    File,
}

#[tauri::command]
pub fn vault_open(
    path: String,
    app: AppHandle,
    state: State<'_, CurrentVault>,
    watcher_state: State<'_, CurrentWatcher>,
    performance: State<'_, PerformanceState>,
) -> Result<VaultInfo, AppError> {
    let started = Instant::now();
    let requested = PathBuf::from(&path);
    if !requested.is_dir() {
        return Err(AppError::VaultUnavailable(path));
    }

    let root = requested.canonicalize()?;
    secure_directory(&root, Path::new(".notem"), true)?;
    app.asset_protocol_scope()
        .allow_directory(&root, true)
        .map_err(|error| AppError::Message(error.to_string()))?;
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Vault")
        .to_owned();

    let progress_app = app.clone();
    let scan = db::full_scan(&root, move |progress: ScanProgress| {
        let _ = progress_app.emit("notem://index-progress", progress);
    })?;
    performance.record_vault_open(started.elapsed().as_secs_f64() * 1_000.0, scan.total_files);

    let event_app = app.clone();
    let unavailable_app = app.clone();
    let watcher = VaultWatcher::start(
        root.clone(),
        move |paths| {
            let payload = serde_json::json!({ "paths": paths });
            let _ = event_app.emit("notem://file-changed", payload.clone());
            let _ = event_app.emit("notem://index-updated", payload);
        },
        move || {
            let _ = unavailable_app.emit("notem://vault-unavailable", ());
        },
    )?;

    let mut current = state
        .0
        .lock()
        .map_err(|_| AppError::Message("vault state lock was poisoned".into()))?;
    *current = Some(VaultState { root: root.clone() });
    drop(current);

    let mut current_watcher = watcher_state
        .0
        .lock()
        .map_err(|_| AppError::Message("watcher state lock was poisoned".into()))?;
    *current_watcher = Some(watcher);

    Ok(VaultInfo {
        path: root.to_string_lossy().into_owned(),
        name,
    })
}

#[tauri::command]
pub fn vault_list(state: State<'_, CurrentVault>) -> Result<Vec<VaultEntry>, AppError> {
    let root = vault_root(&state)?;
    list_directory(&root, &root)
}

pub fn vault_root(state: &State<'_, CurrentVault>) -> Result<PathBuf, AppError> {
    let current = state
        .0
        .lock()
        .map_err(|_| AppError::Message("vault state lock was poisoned".into()))?;
    let root = current
        .as_ref()
        .map(|vault| vault.root.clone())
        .ok_or(AppError::NoVault)?;
    if !root_is_available(&root) {
        return Err(AppError::VaultUnavailable(
            root.to_string_lossy().into_owned(),
        ));
    }
    Ok(root)
}

fn list_directory(root: &Path, directory: &Path) -> Result<Vec<VaultEntry>, AppError> {
    let mut entries = Vec::new();
    for item in fs::read_dir(directory)? {
        let item = item?;
        let name = item.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }

        let file_type = item.file_type()?;
        let path = item.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|_| AppError::InvalidPath(name.clone()))?;
        let relative = relative_path_string(relative)?;

        if file_type.is_dir() {
            entries.push(VaultEntry {
                name,
                path: relative,
                kind: EntryKind::Folder,
                children: list_directory(root, &path)?,
            });
        } else if file_type.is_file() {
            entries.push(VaultEntry {
                name,
                path: relative,
                kind: EntryKind::File,
                children: Vec::new(),
            });
        }
    }

    entries.sort_by(|left, right| {
        let left_folder = left.kind == EntryKind::Folder;
        let right_folder = right.kind == EntryKind::Folder;
        right_folder.cmp(&left_folder).then_with(|| {
            left.name
                .to_lowercase()
                .cmp(&right.name.to_lowercase())
                .then_with(|| left.name.cmp(&right.name))
        })
    });
    Ok(entries)
}

fn relative_path_string(path: &Path) -> Result<String, AppError> {
    let parts: Option<Vec<&str>> = path
        .components()
        .map(|component| component.as_os_str().to_str())
        .collect();
    parts
        .map(|parts| parts.join("/"))
        .ok_or_else(|| AppError::InvalidPath(path.to_string_lossy().into_owned()))
}
