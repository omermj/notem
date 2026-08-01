//! Lightweight runtime performance instrumentation.

use std::sync::Mutex;

use serde::Serialize;

use crate::error::AppError;

#[derive(Debug, Default)]
struct Timings {
    frontend_ready_ms: f64,
    vault_open_ms: f64,
    index_ms: f64,
    search_ms: f64,
    indexed_files: usize,
}

#[derive(Default)]
pub struct PerformanceState(Mutex<Timings>);

impl PerformanceState {
    pub fn record_vault_open(&self, milliseconds: f64, files: usize) {
        if let Ok(mut timings) = self.0.lock() {
            timings.vault_open_ms = milliseconds;
            timings.index_ms = milliseconds;
            timings.indexed_files = files;
        }
    }

    pub fn record_index(&self, milliseconds: f64, files: usize) {
        if let Ok(mut timings) = self.0.lock() {
            timings.index_ms = milliseconds;
            timings.indexed_files = files;
        }
    }

    pub fn record_search(&self, milliseconds: f64) {
        if let Ok(mut timings) = self.0.lock() {
            timings.search_ms = milliseconds;
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugTimings {
    frontend_ready_ms: f64,
    vault_open_ms: f64,
    index_ms: f64,
    search_ms: f64,
    typing_average_ms: f64,
    typing_max_ms: f64,
    indexed_files: usize,
    cold_start_target_met: bool,
    index_target_met: bool,
    search_target_met: bool,
    typing_target_met: bool,
}

#[tauri::command]
pub fn debug_frontend_ready(
    startup_ms: f64,
    state: tauri::State<'_, PerformanceState>,
) -> Result<(), AppError> {
    let mut timings = state
        .0
        .lock()
        .map_err(|_| AppError::Message("performance state lock was poisoned".into()))?;
    timings.frontend_ready_ms = startup_ms.max(0.0);
    Ok(())
}

#[tauri::command]
pub fn debug_timings(
    typing_average_ms: f64,
    typing_max_ms: f64,
    state: tauri::State<'_, PerformanceState>,
) -> Result<DebugTimings, AppError> {
    let timings = state
        .0
        .lock()
        .map_err(|_| AppError::Message("performance state lock was poisoned".into()))?;
    Ok(DebugTimings {
        frontend_ready_ms: timings.frontend_ready_ms,
        vault_open_ms: timings.vault_open_ms,
        index_ms: timings.index_ms,
        search_ms: timings.search_ms,
        typing_average_ms,
        typing_max_ms,
        indexed_files: timings.indexed_files,
        cold_start_target_met: timings.frontend_ready_ms < 1_000.0,
        index_target_met: timings.index_ms < 3_000.0,
        search_target_met: timings.search_ms < 100.0,
        typing_target_met: typing_max_ms < 16.0,
    })
}
