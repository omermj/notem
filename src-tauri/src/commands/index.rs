//! Derived-index command handlers.

use std::time::Instant;

use tauri::{AppHandle, Emitter, State};

use crate::{
    commands::performance::PerformanceState,
    commands::vault::{vault_root, CurrentVault},
    error::AppError,
    index::db::{self, ScanProgress},
};

#[tauri::command]
pub fn index_rebuild(
    app: AppHandle,
    state: State<'_, CurrentVault>,
    performance: State<'_, PerformanceState>,
) -> Result<Vec<String>, AppError> {
    let started = Instant::now();
    let root = vault_root(&state)?;
    let progress_app = app.clone();
    let result = db::rebuild(&root, move |progress: ScanProgress| {
        let _ = progress_app.emit("notem://index-progress", progress);
    })?;
    performance.record_index(
        started.elapsed().as_secs_f64() * 1_000.0,
        result.total_files,
    );
    app.emit(
        "notem://index-updated",
        serde_json::json!({ "paths": result.changed_paths }),
    )
    .map_err(|error| AppError::Message(error.to_string()))?;
    Ok(result.changed_paths)
}
