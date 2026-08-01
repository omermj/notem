//! Desktop startup and file-association helpers.

use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupFile {
    pub vault: String,
    pub path: String,
}

#[derive(Default)]
pub struct PendingStartupFile(pub Mutex<Option<StartupFile>>);

pub fn markdown_path(candidate: PathBuf) -> Option<StartupFile> {
    if !candidate.is_file()
        || !candidate
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        return None;
    }
    let absolute = candidate.canonicalize().ok()?;
    let parent = absolute.parent()?;
    Some(StartupFile {
        vault: parent.to_string_lossy().into_owned(),
        path: absolute.file_name()?.to_string_lossy().into_owned(),
    })
}

pub fn markdown_from_args(args: &[String], cwd: Option<&Path>) -> Option<StartupFile> {
    args.iter().find_map(|argument| {
        let candidate = PathBuf::from(argument);
        let candidate = if candidate.is_absolute() {
            candidate
        } else {
            cwd?.join(candidate)
        };
        markdown_path(candidate)
    })
}

#[tauri::command]
pub fn startup_file(state: tauri::State<'_, PendingStartupFile>) -> Option<StartupFile> {
    if let Ok(mut pending) = state.0.lock() {
        if pending.is_some() {
            return pending.take();
        }
    }
    markdown_from_args(
        &std::env::args().collect::<Vec<_>>(),
        std::env::current_dir().ok().as_deref(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_non_markdown_arguments() {
        assert!(markdown_from_args(&["notem".into(), "note.txt".into()], None).is_none());
    }
}
