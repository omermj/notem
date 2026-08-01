//! Vault path validation and symlink containment.

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
};

use crate::error::AppError;

pub fn validate_relative(path: &str, allow_empty: bool) -> Result<PathBuf, AppError> {
    if path.contains('\\') || path.contains('\0') {
        return Err(AppError::InvalidPath(path.into()));
    }
    if path.is_empty() {
        return if allow_empty {
            Ok(PathBuf::new())
        } else {
            Err(AppError::InvalidPath(path.into()))
        };
    }

    let candidate = Path::new(path);
    if candidate.is_absolute()
        || candidate.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
        || candidate
            .components()
            .any(|component| matches!(component, Component::CurDir))
    {
        return Err(AppError::InvalidPath(path.into()));
    }
    Ok(candidate.to_path_buf())
}

pub fn resolve_existing(root: &Path, relative: &str) -> Result<PathBuf, AppError> {
    let relative = validate_relative(relative, false)?;
    let root = canonicalize_root(root)?;
    reject_symlink_components(&root, &relative)?;
    let canonical = root.join(&relative).canonicalize()?;
    ensure_inside(&root, &canonical, &relative.to_string_lossy())?;
    Ok(canonical)
}

pub fn resolve_optional_existing(root: &Path, relative: &str) -> Result<Option<PathBuf>, AppError> {
    match resolve_existing(root, relative) {
        Ok(path) => Ok(Some(path)),
        Err(AppError::InvalidPath(_)) => Ok(None),
        Err(AppError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

pub fn resolve_directory(root: &Path, relative: &str) -> Result<PathBuf, AppError> {
    let relative = validate_relative(relative, true)?;
    let directory = secure_directory(root, &relative, false)?;
    if !directory.is_dir() {
        return Err(AppError::Message(format!(
            "not a directory: {}",
            relative.to_string_lossy()
        )));
    }
    Ok(directory)
}

pub fn secure_directory(
    root: &Path,
    relative: &Path,
    create_missing: bool,
) -> Result<PathBuf, AppError> {
    let root = canonicalize_root(root)?;
    let mut current = root.clone();
    ensure_inside(&root, &current, &relative.to_string_lossy())?;
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return Err(AppError::InvalidPath(
                relative.to_string_lossy().into_owned(),
            ));
        };
        current.push(name);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(AppError::InvalidPath(
                    relative.to_string_lossy().into_owned(),
                ));
            }
            Ok(metadata) if metadata.is_dir() => {}
            Ok(_) => {
                return Err(AppError::Message(format!(
                    "not a directory: {}",
                    current.to_string_lossy()
                )));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && create_missing => {
                fs::create_dir(&current)?;
                let metadata = fs::symlink_metadata(&current)?;
                if metadata.file_type().is_symlink() || !metadata.is_dir() {
                    return Err(AppError::InvalidPath(
                        relative.to_string_lossy().into_owned(),
                    ));
                }
            }
            Err(error) => return Err(error.into()),
        }
    }
    let canonical = current.canonicalize()?;
    ensure_inside(&root, &canonical, &relative.to_string_lossy())?;
    Ok(canonical)
}

pub fn resolve_new_file(
    root: &Path,
    relative: &Path,
    create_parents: bool,
) -> Result<PathBuf, AppError> {
    let relative_text = relative
        .to_str()
        .ok_or_else(|| AppError::InvalidPath(relative.to_string_lossy().into_owned()))?;
    validate_relative(relative_text, false)?;
    let name = relative
        .file_name()
        .ok_or_else(|| AppError::InvalidPath(relative_text.into()))?;
    let parent = relative.parent().unwrap_or_else(|| Path::new(""));
    let directory = secure_directory(root, parent, create_parents)?;
    let destination = directory.join(name);
    match fs::symlink_metadata(&destination) {
        Ok(_) => Err(AppError::Message(format!(
            "a file or folder already exists at {relative_text}"
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(destination),
        Err(error) => Err(error.into()),
    }
}

pub fn resolve_write_file(
    root: &Path,
    relative: &str,
    create_parents: bool,
) -> Result<PathBuf, AppError> {
    let relative_path = validate_relative(relative, false)?;
    let root = canonicalize_root(root)?;
    match fs::symlink_metadata(root.join(&relative_path)) {
        Ok(_) => resolve_existing(&root, relative),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            resolve_new_file(&root, &relative_path, create_parents)
        }
        Err(error) => Err(error.into()),
    }
}

pub fn path_exists(path: &Path) -> Result<bool, AppError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

pub fn write_new(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    let result = file.write_all(bytes).and_then(|()| file.sync_all());
    drop(file);
    if let Err(error) = result {
        let _ = fs::remove_file(path);
        return Err(error.into());
    }
    Ok(())
}

pub fn reserve_new(path: &Path) -> Result<(), AppError> {
    OpenOptions::new().write(true).create_new(true).open(path)?;
    Ok(())
}

pub fn root_is_available(root: &Path) -> bool {
    canonicalize_root(root).is_ok()
}

fn canonicalize_root(root: &Path) -> Result<PathBuf, AppError> {
    let metadata = fs::symlink_metadata(root)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(AppError::VaultUnavailable(
            root.to_string_lossy().into_owned(),
        ));
    }
    Ok(root.canonicalize()?)
}

fn reject_symlink_components(root: &Path, relative: &Path) -> Result<(), AppError> {
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return Err(AppError::InvalidPath(
                relative.to_string_lossy().into_owned(),
            ));
        };
        current.push(name);
        let metadata = fs::symlink_metadata(&current)?;
        if metadata.file_type().is_symlink() {
            return Err(AppError::InvalidPath(
                relative.to_string_lossy().into_owned(),
            ));
        }
    }
    Ok(())
}

fn ensure_inside(root: &Path, path: &Path, original: &str) -> Result<(), AppError> {
    if path == root || path.starts_with(root) {
        Ok(())
    } else {
        Err(AppError::InvalidPath(original.into()))
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{
        resolve_existing, resolve_new_file, resolve_write_file, root_is_available, secure_directory,
    };

    #[cfg(unix)]
    fn symlink_directory(source: &std::path::Path, target: &std::path::Path) -> bool {
        std::os::unix::fs::symlink(source, target).expect("directory symlink");
        true
    }

    #[cfg(unix)]
    fn symlink_file(source: &std::path::Path, target: &std::path::Path) -> bool {
        std::os::unix::fs::symlink(source, target).expect("file symlink");
        true
    }

    #[cfg(windows)]
    fn symlink_file(source: &std::path::Path, target: &std::path::Path) -> bool {
        match std::os::windows::fs::symlink_file(source, target) {
            Ok(()) => true,
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::Unsupported
                ) =>
            {
                false
            }
            Err(error) => panic!("file symlink: {error}"),
        }
    }

    #[cfg(windows)]
    fn symlink_directory(source: &std::path::Path, target: &std::path::Path) -> bool {
        match std::os::windows::fs::symlink_dir(source, target) {
            Ok(()) => true,
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::Unsupported
                ) =>
            {
                false
            }
            Err(error) => panic!("directory symlink: {error}"),
        }
    }

    #[test]
    fn rejects_existing_files_reached_through_symlinked_directories() {
        let vault = tempfile::tempdir().expect("vault");
        let outside = tempfile::tempdir().expect("outside");
        fs::write(outside.path().join("Secret.md"), "secret").expect("outside note");
        if !symlink_directory(outside.path(), &vault.path().join("Linked")) {
            return;
        }
        let root = vault.path().canonicalize().expect("canonical vault");

        assert!(resolve_existing(&root, "Linked/Secret.md").is_err());
    }

    #[test]
    fn rejects_new_files_below_symlinked_directories() {
        let vault = tempfile::tempdir().expect("vault");
        let outside = tempfile::tempdir().expect("outside");
        if !symlink_directory(outside.path(), &vault.path().join("Linked")) {
            return;
        }
        let root = vault.path().canonicalize().expect("canonical vault");

        assert!(resolve_new_file(&root, std::path::Path::new("Linked/New.md"), true).is_err());
        assert!(!outside.path().join("New.md").exists());
    }

    #[test]
    fn rejects_symlinked_internal_metadata_directory() {
        let vault = tempfile::tempdir().expect("vault");
        let outside = tempfile::tempdir().expect("outside");
        if !symlink_directory(outside.path(), &vault.path().join(".notem")) {
            return;
        }
        let root = vault.path().canonicalize().expect("canonical vault");

        assert!(secure_directory(&root, std::path::Path::new(".notem"), true).is_err());
    }

    #[test]
    fn rejects_final_file_symlinks_for_settings_and_index_writes() {
        let vault = tempfile::tempdir().expect("vault");
        let outside = tempfile::NamedTempFile::new().expect("outside file");
        fs::create_dir(vault.path().join(".notem")).expect("metadata directory");
        if !symlink_file(outside.path(), &vault.path().join(".notem/settings.json")) {
            return;
        }
        if !symlink_file(outside.path(), &vault.path().join(".notem/index.db-wal")) {
            return;
        }
        let root = vault.path().canonicalize().expect("canonical vault");

        assert!(resolve_write_file(&root, ".notem/settings.json", false).is_err());
        assert!(resolve_write_file(&root, ".notem/index.db-wal", false).is_err());
    }

    #[test]
    fn rejects_a_vault_root_replaced_by_a_symlink() {
        let parent = tempfile::tempdir().expect("parent");
        let outside = tempfile::tempdir().expect("outside");
        let vault = parent.path().join("Vault");
        fs::create_dir(&vault).expect("vault");
        let root = vault.canonicalize().expect("canonical vault");
        fs::remove_dir(&vault).expect("remove vault");
        if !symlink_directory(outside.path(), &vault) {
            return;
        }

        assert!(!root_is_available(&root));
        assert!(resolve_new_file(&root, std::path::Path::new("Escape.md"), true).is_err());
        assert!(!outside.path().join("Escape.md").exists());
    }
}
