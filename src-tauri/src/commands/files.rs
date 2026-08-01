//! Vault-relative file command handlers.

use std::{
    collections::HashMap,
    fs,
    path::{Component, Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};

use serde::Serialize;
use tauri::{State, Url};
use walkdir::WalkDir;

pub(crate) use crate::vault_path::{resolve_existing, validate_relative as validate_relative_path};

use crate::{
    commands::vault::{vault_root, CurrentVault},
    error::AppError,
    index::db,
    vault_path::{
        path_exists, reserve_new, resolve_directory, resolve_new_file, secure_directory, write_new,
    },
};

pub const LARGE_FILE_WARNING_BYTES: u64 = 2 * 1024 * 1024;
pub const READONLY_FILE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContents {
    pub content: String,
    pub mtime: i64,
    pub size: u64,
    pub kind: FileKind,
    pub readonly: bool,
    pub warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub mtime: i64,
    pub size: u64,
    pub view_kind: FileViewKind,
    pub readonly: bool,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Text,
    Binary,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileViewKind {
    Markdown,
    Pdf,
    Binary,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteResult {
    pub mtime: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportedAttachment {
    pub vault_path: String,
    pub markdown_path: String,
    pub media_type: String,
    pub is_image: bool,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentResolution {
    pub status: AttachmentResolutionStatus,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AttachmentResolutionStatus {
    Resolved,
    Ambiguous,
    Unresolved,
}

#[tauri::command]
pub fn file_info(path: String, state: State<'_, CurrentVault>) -> Result<FileInfo, AppError> {
    let root = vault_root(&state)?;
    let absolute = resolve_existing(&root, &path)?;
    if !absolute.is_file() {
        return Err(AppError::Message(format!("not a file: {path}")));
    }
    let metadata = fs::metadata(&absolute)?;
    let size = metadata.len();
    let view_kind = match absolute
        .extension()
        .and_then(|extension| extension.to_str())
    {
        Some(extension) if extension.eq_ignore_ascii_case("md") => FileViewKind::Markdown,
        Some(extension) if extension.eq_ignore_ascii_case("pdf") => FileViewKind::Pdf,
        _ => FileViewKind::Binary,
    };
    Ok(FileInfo {
        mtime: modified_timestamp(&absolute)?,
        size,
        readonly: view_kind != FileViewKind::Markdown || size > READONLY_FILE_BYTES,
        view_kind,
    })
}

#[tauri::command]
pub fn attachment_resolve(
    source_path: String,
    target: String,
    state: State<'_, CurrentVault>,
) -> Result<AttachmentResolution, AppError> {
    let root = vault_root(&state)?;
    resolve_attachment(&root, &source_path, &target)
}

#[tauri::command]
pub fn file_read(path: String, state: State<'_, CurrentVault>) -> Result<FileContents, AppError> {
    let root = vault_root(&state)?;
    let absolute = resolve_existing(&root, &path)?;
    if !absolute.is_file() {
        return Err(AppError::Message(format!("not a file: {path}")));
    }
    let bytes = fs::read(&absolute)?;
    let size = u64::try_from(bytes.len())
        .map_err(|_| AppError::Message("file size is out of range".into()))?;
    let (content, kind) = match String::from_utf8(bytes) {
        Ok(content) => (content, FileKind::Text),
        Err(_) => (String::new(), FileKind::Binary),
    };
    let mtime = modified_timestamp(&absolute)?;
    let readonly = kind == FileKind::Binary || size > READONLY_FILE_BYTES;
    let warning = if kind == FileKind::Binary {
        Some("This file is binary and cannot be edited in NoteM.".into())
    } else if readonly {
        Some("Files larger than 10 MB are opened read-only.".into())
    } else if size > LARGE_FILE_WARNING_BYTES {
        Some("Large file: editor features may be slower than usual.".into())
    } else {
        None
    };
    Ok(FileContents {
        content,
        mtime,
        size,
        kind,
        readonly,
        warning,
    })
}

#[tauri::command]
pub fn file_write(
    path: String,
    content: String,
    known_mtime: i64,
    state: State<'_, CurrentVault>,
) -> Result<FileWriteResult, AppError> {
    let root = vault_root(&state)?;
    let absolute = resolve_existing(&root, &path)?;
    if !absolute.is_file() {
        return Err(AppError::Message(format!("not a file: {path}")));
    }
    if fs::metadata(&absolute)?.len() > READONLY_FILE_BYTES {
        return Err(AppError::Message(
            "files larger than 10 MB are read-only".into(),
        ));
    }

    if modified_timestamp(&absolute)? > known_mtime {
        return Err(AppError::Conflict(path));
    }

    fs::write(&absolute, content)?;
    db::sync_paths(&root, std::slice::from_ref(&path))?;
    Ok(FileWriteResult {
        mtime: modified_timestamp(&absolute)?,
    })
}

#[tauri::command]
pub fn file_write_force(
    path: String,
    content: String,
    state: State<'_, CurrentVault>,
) -> Result<FileWriteResult, AppError> {
    let root = vault_root(&state)?;
    let absolute = resolve_existing(&root, &path)?;
    if fs::metadata(&absolute)?.len() > READONLY_FILE_BYTES {
        return Err(AppError::Message(
            "files larger than 10 MB are read-only".into(),
        ));
    }
    fs::write(&absolute, content)?;
    db::sync_paths(&root, std::slice::from_ref(&path))?;
    Ok(FileWriteResult {
        mtime: modified_timestamp(&absolute)?,
    })
}
#[tauri::command]
pub fn file_create(path: String, state: State<'_, CurrentVault>) -> Result<String, AppError> {
    let root = vault_root(&state)?;
    let directory = resolve_directory(&root, &path)?;
    let mut number = 0;
    loop {
        let name = if number == 0 {
            "Untitled.md".to_owned()
        } else {
            format!("Untitled {number}.md")
        };
        let candidate = directory.join(&name);
        if !path_exists(&candidate)? {
            write_new(&candidate, b"")?;
            let relative = relative_to_string(&root, &candidate)?;
            db::sync_paths(&root, std::slice::from_ref(&relative))?;
            return Ok(relative);
        }
        number += 1;
    }
}

#[tauri::command]
pub fn file_create_at(path: String, state: State<'_, CurrentVault>) -> Result<String, AppError> {
    file_create_with_content(path, String::new(), state)
}

#[tauri::command]
pub fn file_create_with_content(
    path: String,
    content: String,
    state: State<'_, CurrentVault>,
) -> Result<String, AppError> {
    let root = vault_root(&state)?;
    let mut relative = validate_relative_path(path.trim_matches('/'), false)?;
    if relative.extension().is_none() {
        relative.set_extension("md");
    }
    if !relative
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        return Err(AppError::InvalidPath(path));
    }
    let destination = resolve_new_file(&root, &relative, true)?;
    write_new(&destination, content.as_bytes())?;
    let relative = relative_to_string(&root, &destination)?;
    db::sync_paths(&root, std::slice::from_ref(&relative))?;
    Ok(relative)
}

#[tauri::command]
pub fn attachment_import(
    source_path: String,
    note_path: String,
    state: State<'_, CurrentVault>,
) -> Result<ImportedAttachment, AppError> {
    let root = vault_root(&state)?;
    let source = PathBuf::from(&source_path).canonicalize()?;
    if !source.is_file() {
        return Err(AppError::Message(format!("not a file: {source_path}")));
    }
    let name = source
        .file_name()
        .ok_or_else(|| AppError::InvalidPath(source_path.clone()))?;
    import_attachment(&root, &note_path, name, |destination| {
        if source != destination {
            fs::copy(&source, destination)?;
        }
        Ok(())
    })
}

#[tauri::command]
pub fn attachment_import_bytes(
    note_path: String,
    file_name: String,
    bytes: Vec<u8>,
    state: State<'_, CurrentVault>,
) -> Result<ImportedAttachment, AppError> {
    let root = vault_root(&state)?;
    validate_name(&file_name)?;
    import_attachment(
        &root,
        &note_path,
        Path::new(&file_name).as_os_str(),
        |destination| {
            fs::write(destination, &bytes)?;
            Ok(())
        },
    )
}

#[tauri::command]
pub fn path_import(
    source_paths: Vec<String>,
    destination: String,
    state: State<'_, CurrentVault>,
) -> Result<Vec<String>, AppError> {
    let root = vault_root(&state)?;
    let destination = resolve_directory(&root, &destination)?;
    let mut imported = Vec::new();
    for source_path in source_paths {
        let source = PathBuf::from(&source_path).canonicalize()?;
        if source.starts_with(&root) || root.starts_with(&source) {
            return Err(AppError::Message(format!(
                "cannot import a vault path into itself: {source_path}"
            )));
        }
        let name = source
            .file_name()
            .ok_or_else(|| AppError::InvalidPath(source_path.clone()))?;
        let target = unique_destination(&destination, name)?;
        copy_external_entry(&source, &target)?;
        imported.push(relative_to_string(&root, &target)?);
    }
    db::full_scan(&root, |_| {})?;
    Ok(imported)
}

#[tauri::command]
pub fn folder_create(path: String, state: State<'_, CurrentVault>) -> Result<String, AppError> {
    let root = vault_root(&state)?;
    let directory = resolve_directory(&root, &path)?;
    let mut number = 0;
    loop {
        let name = if number == 0 {
            "New folder".to_owned()
        } else {
            format!("New folder {number}")
        };
        let candidate = directory.join(&name);
        if !path_exists(&candidate)? {
            fs::create_dir(&candidate)?;
            return relative_to_string(&root, &candidate);
        }
        number += 1;
    }
}

#[tauri::command]
pub fn file_rename(
    path: String,
    new_name: String,
    state: State<'_, CurrentVault>,
) -> Result<String, AppError> {
    let root = vault_root(&state)?;
    rename_path(&root, &path, &new_name)
}

pub fn rename_path(root: &Path, path: &str, new_name: &str) -> Result<String, AppError> {
    validate_name(new_name)?;
    let source = resolve_existing(root, path)?;
    let parent = source
        .parent()
        .ok_or_else(|| AppError::InvalidPath(path.to_owned()))?;
    let destination = parent.join(new_name);
    ensure_destination(root, &destination)?;
    let mappings = note_path_mappings(root, &source, &destination)?;
    let rewrites = prepare_link_rewrites(root, &mappings)?;
    fs::rename(&source, &destination)?;
    apply_link_rewrites(root, &mappings, rewrites)?;
    db::full_scan(root, |_| {})?;
    relative_to_string(root, &destination)
}

#[tauri::command]
pub fn file_move(
    path: String,
    destination: String,
    state: State<'_, CurrentVault>,
) -> Result<String, AppError> {
    let root = vault_root(&state)?;
    let source = resolve_existing(&root, &path)?;
    let destination_directory = resolve_directory(&root, &destination)?;
    let name = source
        .file_name()
        .ok_or_else(|| AppError::InvalidPath(path.clone()))?;
    let target = destination_directory.join(name);
    ensure_destination(&root, &target)?;
    if source.is_dir() && destination_directory.starts_with(&source) {
        return Err(AppError::InvalidPath(
            "cannot move a folder inside itself".into(),
        ));
    }
    let mappings = note_path_mappings(&root, &source, &target)?;
    let rewrites = prepare_link_rewrites(&root, &mappings)?;
    fs::rename(source, &target)?;
    apply_link_rewrites(&root, &mappings, rewrites)?;
    db::full_scan(&root, |_| {})?;
    relative_to_string(&root, &target)
}

#[tauri::command]
pub fn file_delete(path: String, state: State<'_, CurrentVault>) -> Result<(), AppError> {
    let root = vault_root(&state)?;
    let absolute = resolve_existing(&root, &path)?;
    trash::delete(&absolute).map_err(|error| AppError::Trash(error.to_string()))?;
    db::full_scan(&root, |_| {})?;
    Ok(())
}

#[tauri::command]
pub fn file_reveal(path: String, state: State<'_, CurrentVault>) -> Result<(), AppError> {
    let root = vault_root(&state)?;
    let absolute = resolve_existing(&root, &path)?;
    reveal_in_file_manager(&absolute)
}

#[tauri::command]
pub fn file_open_external(path: String, state: State<'_, CurrentVault>) -> Result<(), AppError> {
    let root = vault_root(&state)?;
    let absolute = resolve_existing(&root, &path)?;
    open::that(&absolute).map_err(|error| AppError::Message(error.to_string()))
}

#[tauri::command]
pub fn url_open_external(url: String) -> Result<(), AppError> {
    let parsed = Url::parse(&url).map_err(|_| AppError::InvalidPath(url.clone()))?;
    if !matches!(parsed.scheme(), "http" | "https" | "mailto") {
        return Err(AppError::Message(format!(
            "external URL scheme is not allowed: {}",
            parsed.scheme()
        )));
    }
    open::that(parsed.as_str()).map_err(|error| AppError::Message(error.to_string()))
}

fn ensure_destination(root: &Path, destination: &Path) -> Result<(), AppError> {
    if path_exists(destination)? {
        return Err(AppError::Message(format!(
            "a file or folder already exists at {}",
            destination.to_string_lossy()
        )));
    }
    let parent = destination
        .parent()
        .ok_or_else(|| AppError::InvalidPath(destination.to_string_lossy().into_owned()))?
        .canonicalize()?;
    ensure_inside(root, &parent, &destination.to_string_lossy())
}

fn unique_destination(directory: &Path, name: &std::ffi::OsStr) -> Result<PathBuf, AppError> {
    let original = Path::new(name);
    let stem = original
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Imported");
    let extension = original.extension().and_then(|value| value.to_str());
    let mut number = 0;
    loop {
        let candidate_name = if number == 0 {
            name.to_os_string()
        } else if let Some(extension) = extension {
            format!("{stem} {number}.{extension}").into()
        } else {
            format!("{stem} {number}").into()
        };
        let candidate = directory.join(candidate_name);
        if !path_exists(&candidate)? {
            return Ok(candidate);
        }
        number += 1;
    }
}

fn resolve_attachment(
    root: &Path,
    source_path: &str,
    target: &str,
) -> Result<AttachmentResolution, AppError> {
    let raw_path = target
        .split_once('#')
        .map_or(target, |(path, _)| path)
        .trim()
        .trim_matches(['<', '>']);
    let decoded = urlencoding::decode(raw_path)
        .map_err(|_| AppError::InvalidPath(target.to_owned()))?
        .replace('\\', "/");
    if decoded.is_empty() || decoded.contains('\0') || decoded.contains("://") {
        return Ok(AttachmentResolution {
            status: AttachmentResolutionStatus::Unresolved,
            path: None,
        });
    }

    let mut files = Vec::new();
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            entry.path() == root
                || !entry
                    .file_name()
                    .to_str()
                    .is_some_and(|name| name.starts_with('.'))
        })
    {
        let entry = entry.map_err(|error| AppError::Message(error.to_string()))?;
        if entry.file_type().is_file() {
            files.push(relative_to_string(root, entry.path())?);
        }
    }

    let source_parent = Path::new(source_path)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    let relative_candidate = normalize_attachment_target(source_parent, &decoded);
    let root_candidate =
        normalize_attachment_target(Path::new(""), decoded.trim_start_matches('/'));
    for candidate in [relative_candidate, root_candidate].into_iter().flatten() {
        let matches: Vec<&String> = files
            .iter()
            .filter(|path| path.eq_ignore_ascii_case(&candidate))
            .collect();
        if matches.len() == 1 {
            return Ok(AttachmentResolution {
                status: AttachmentResolutionStatus::Resolved,
                path: Some(matches[0].clone()),
            });
        }
        if matches.len() > 1 {
            return Ok(AttachmentResolution {
                status: AttachmentResolutionStatus::Ambiguous,
                path: None,
            });
        }
    }

    let file_name = Path::new(&decoded)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&decoded);
    let matches: Vec<&String> = files
        .iter()
        .filter(|path| {
            Path::new(path)
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.eq_ignore_ascii_case(file_name))
        })
        .collect();
    Ok(match matches.as_slice() {
        [path] => AttachmentResolution {
            status: AttachmentResolutionStatus::Resolved,
            path: Some((*path).clone()),
        },
        [] => AttachmentResolution {
            status: AttachmentResolutionStatus::Unresolved,
            path: None,
        },
        _ => AttachmentResolution {
            status: AttachmentResolutionStatus::Ambiguous,
            path: None,
        },
    })
}

fn normalize_attachment_target(base: &Path, target: &str) -> Option<String> {
    let mut parts: Vec<String> = base
        .components()
        .filter_map(|component| match component {
            Component::Normal(part) => part.to_str().map(ToOwned::to_owned),
            _ => None,
        })
        .collect();
    for part in target.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            part => parts.push(part.to_owned()),
        }
    }
    (!parts.is_empty()).then(|| parts.join("/"))
}

fn import_attachment(
    root: &Path,
    note_path: &str,
    name: &std::ffi::OsStr,
    write: impl FnOnce(&Path) -> Result<(), AppError>,
) -> Result<ImportedAttachment, AppError> {
    let note = resolve_existing(root, note_path)?;
    if !note.is_file()
        || !note
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        return Err(AppError::Message(format!(
            "not a Markdown note: {note_path}"
        )));
    }
    let note_directory = note
        .parent()
        .ok_or_else(|| AppError::InvalidPath(note_path.into()))?;
    let note_directory_relative = relative_to_string(root, note_directory)?;
    let attachments_relative = Path::new(&note_directory_relative).join("attachments");
    let attachments = secure_directory(root, &attachments_relative, true)?;
    let destination = unique_destination(&attachments, name)?;
    reserve_new(&destination)?;
    if let Err(error) = write(&destination) {
        let _ = fs::remove_file(&destination);
        return Err(error);
    }
    let vault_path = relative_to_string(root, &destination)?;
    db::sync_paths(root, std::slice::from_ref(&vault_path))?;
    let file_name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::InvalidPath(destination.to_string_lossy().into_owned()))?;
    Ok(ImportedAttachment {
        vault_path,
        markdown_path: format!("attachments/{file_name}"),
        media_type: media_type(&destination).into(),
        is_image: is_supported_image(&destination),
    })
}

fn media_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("svg") => "image/svg+xml",
        Some("avif") => "image/avif",
        Some("pdf") => "application/pdf",
        _ => "application/octet-stream",
    }
}

fn copy_external_entry(source: &Path, destination: &Path) -> Result<(), AppError> {
    let metadata = fs::symlink_metadata(source)?;
    if metadata.file_type().is_symlink() {
        return Err(AppError::Message(format!(
            "symbolic links cannot be imported: {}",
            source.to_string_lossy()
        )));
    }
    if metadata.is_file() {
        fs::copy(source, destination)?;
        return Ok(());
    }
    if !metadata.is_dir() {
        return Err(AppError::Message(format!(
            "unsupported import item: {}",
            source.to_string_lossy()
        )));
    }
    fs::create_dir(destination)?;
    for item in fs::read_dir(source)? {
        let item = item?;
        let name = item.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        copy_external_entry(&item.path(), &destination.join(name))?;
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

fn validate_name(name: &str) -> Result<(), AppError> {
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
        || name.contains('\0')
    {
        return Err(AppError::InvalidPath(name.into()));
    }
    Ok(())
}

fn relative_to_string(root: &Path, absolute: &Path) -> Result<String, AppError> {
    let relative = absolute
        .strip_prefix(root)
        .map_err(|_| AppError::InvalidPath(absolute.to_string_lossy().into_owned()))?;
    let parts: Option<Vec<&str>> = relative
        .components()
        .map(|component| component.as_os_str().to_str())
        .collect();
    parts
        .map(|parts| parts.join("/"))
        .ok_or_else(|| AppError::InvalidPath(relative.to_string_lossy().into_owned()))
}

pub(crate) fn modified_timestamp(path: &Path) -> Result<i64, AppError> {
    let duration = fs::metadata(path)?
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map_err(|_| AppError::Message("file modification time predates Unix epoch".into()))?;
    // Microseconds retain practical filesystem precision while remaining exactly
    // representable by JavaScript's integer number range for current dates.
    i64::try_from(duration.as_micros())
        .map_err(|_| AppError::Message("file modification time is out of range".into()))
}

fn note_path_mappings(
    root: &Path,
    source: &Path,
    destination: &Path,
) -> Result<HashMap<String, String>, AppError> {
    let mut mappings = HashMap::new();
    if source.is_file() {
        if is_markdown(source) {
            mappings.insert(
                relative_to_string(root, source)?,
                relative_to_string(root, destination)?,
            );
        }
        return Ok(mappings);
    }

    for entry in WalkDir::new(source) {
        let entry = entry.map_err(|error| AppError::Message(error.to_string()))?;
        if !entry.file_type().is_file() || !is_markdown(entry.path()) {
            continue;
        }
        let suffix = entry
            .path()
            .strip_prefix(source)
            .map_err(|_| AppError::InvalidPath(entry.path().to_string_lossy().into_owned()))?;
        mappings.insert(
            relative_to_string(root, entry.path())?,
            relative_to_string(root, &destination.join(suffix))?,
        );
    }
    Ok(mappings)
}

fn prepare_link_rewrites(
    root: &Path,
    mappings: &HashMap<String, String>,
) -> Result<HashMap<String, HashMap<usize, String>>, AppError> {
    let mut rewrites: HashMap<String, HashMap<usize, String>> = HashMap::new();
    for (old_path, new_path) in mappings {
        let new_identity = db::note_identity(new_path);
        for (source, positions) in db::inbound_link_positions(root, old_path)? {
            for position in positions {
                rewrites
                    .entry(source.clone())
                    .or_default()
                    .insert(position, new_identity.clone());
            }
        }
    }
    Ok(rewrites)
}

fn apply_link_rewrites(
    root: &Path,
    mappings: &HashMap<String, String>,
    rewrites: HashMap<String, HashMap<usize, String>>,
) -> Result<(), AppError> {
    let wikilink = regex::Regex::new(r"\[\[([^\]\|\n]+?)(?:\|([^\]\n]+?))?\]\]")
        .map_err(|error| AppError::Message(error.to_string()))?;
    for (source_path, replacements) in rewrites {
        let actual_source = mappings.get(&source_path).unwrap_or(&source_path);
        let absolute = resolve_existing(root, actual_source)?;
        let content = fs::read_to_string(&absolute)?;
        let mut edits = Vec::new();
        for captures in wikilink.captures_iter(&content) {
            let Some(complete) = captures.get(0) else {
                continue;
            };
            let Some(new_target) = replacements.get(&complete.start()) else {
                continue;
            };
            let original_target = captures
                .get(1)
                .map(|capture| capture.as_str())
                .unwrap_or_default();
            let heading = original_target
                .find('#')
                .map(|index| &original_target[index..])
                .unwrap_or_default();
            let display = captures
                .get(2)
                .map(|capture| format!("|{}", capture.as_str()))
                .unwrap_or_default();
            edits.push((
                complete.start(),
                complete.end(),
                format!("[[{new_target}{heading}{display}]]"),
            ));
        }
        if edits.is_empty() {
            continue;
        }
        let mut updated = content;
        for (start, end, replacement) in edits.into_iter().rev() {
            updated.replace_range(start..end, &replacement);
        }
        fs::write(absolute, updated)?;
    }
    Ok(())
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
}

fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "avif"
            )
        })
}

#[cfg(target_os = "macos")]
fn reveal_in_file_manager(path: &Path) -> Result<(), AppError> {
    Command::new("open").arg("-R").arg(path).spawn()?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn reveal_in_file_manager(path: &Path) -> Result<(), AppError> {
    Command::new("explorer")
        .arg(format!("/select,{}", path.to_string_lossy()))
        .spawn()?;
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn reveal_in_file_manager(path: &Path) -> Result<(), AppError> {
    let directory = if path.is_dir() {
        path
    } else {
        path.parent().unwrap_or(path)
    };
    Command::new("xdg-open").arg(directory).spawn()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{
        copy_external_entry, import_attachment, resolve_attachment, unique_destination,
        validate_relative_path, AttachmentResolution, AttachmentResolutionStatus,
    };

    #[test]
    fn accepts_vault_relative_forward_slash_paths() {
        assert!(validate_relative_path("Daily/2026-07-25.md", false).is_ok());
        assert!(validate_relative_path("note.md", false).is_ok());
        assert!(validate_relative_path("", true).is_ok());
    }

    #[test]
    fn rejects_parent_and_absolute_paths() {
        for path in [
            "../secret.md",
            "notes/../../secret.md",
            "/tmp/secret.md",
            "./note.md",
            "notes\\secret.md",
            "",
        ] {
            assert!(validate_relative_path(path, false).is_err(), "{path}");
        }
    }

    #[test]
    fn import_destinations_preserve_extensions_when_renamed() {
        let directory = tempfile::tempdir().expect("temporary directory");
        fs::write(directory.path().join("Plan.md"), "").expect("fixture");
        assert_eq!(
            unique_destination(directory.path(), std::ffi::OsStr::new("Plan.md"))
                .expect("destination"),
            directory.path().join("Plan 1.md")
        );
    }

    #[test]
    fn external_directory_copy_preserves_nested_files() {
        let source = tempfile::tempdir().expect("source");
        let destination = tempfile::tempdir().expect("destination");
        fs::create_dir(source.path().join("Nested")).expect("nested source");
        fs::write(source.path().join("Nested/Note.md"), "# Imported").expect("fixture");
        let target = destination.path().join("Imported");
        copy_external_entry(source.path(), &target).expect("copy");
        assert_eq!(
            fs::read_to_string(target.join("Nested/Note.md")).expect("copied note"),
            "# Imported"
        );
    }

    #[test]
    fn attachments_are_created_next_to_their_note() {
        let vault = tempfile::tempdir().expect("vault");
        let root = vault.path().canonicalize().expect("canonical vault");
        fs::create_dir_all(vault.path().join("Projects")).expect("note directory");
        fs::write(vault.path().join("Projects/Plan.md"), "# Plan").expect("note");

        let imported = import_attachment(
            &root,
            "Projects/Plan.md",
            std::ffi::OsStr::new("Diagram one.png"),
            |destination| {
                fs::write(destination, b"image")?;
                Ok(())
            },
        )
        .expect("attachment import");

        assert_eq!(imported.vault_path, "Projects/attachments/Diagram one.png");
        assert_eq!(imported.markdown_path, "attachments/Diagram one.png");
        assert_eq!(imported.media_type, "image/png");
        assert!(imported.is_image);
        assert!(vault
            .path()
            .join("Projects/attachments/Diagram one.png")
            .is_file());
    }

    #[test]
    fn pdf_attachments_are_created_next_to_their_note() {
        let vault = tempfile::tempdir().expect("vault");
        let root = vault.path().canonicalize().expect("canonical vault");
        fs::create_dir_all(vault.path().join("Projects")).expect("note directory");
        fs::write(vault.path().join("Projects/Plan.md"), "# Plan").expect("note");

        let imported = import_attachment(
            &root,
            "Projects/Plan.md",
            std::ffi::OsStr::new("Reference.pdf"),
            |destination| {
                fs::write(destination, b"%PDF-1.7")?;
                Ok(())
            },
        )
        .expect("PDF attachment import");

        assert_eq!(imported.vault_path, "Projects/attachments/Reference.pdf");
        assert_eq!(imported.markdown_path, "attachments/Reference.pdf");
        assert_eq!(imported.media_type, "application/pdf");
        assert!(!imported.is_image);
        assert!(vault
            .path()
            .join("Projects/attachments/Reference.pdf")
            .is_file());
    }

    #[test]
    fn attachment_names_are_made_unique_per_note_folder() {
        let vault = tempfile::tempdir().expect("vault");
        let root = vault.path().canonicalize().expect("canonical vault");
        fs::write(vault.path().join("Note.md"), "").expect("note");
        fs::create_dir(vault.path().join("attachments")).expect("attachments");
        fs::write(vault.path().join("attachments/photo.png"), b"old").expect("existing");

        let imported = import_attachment(
            &root,
            "Note.md",
            std::ffi::OsStr::new("photo.png"),
            |destination| {
                fs::write(destination, b"new")?;
                Ok(())
            },
        )
        .expect("attachment import");

        assert_eq!(imported.vault_path, "attachments/photo 1.png");
        assert_eq!(imported.markdown_path, "attachments/photo 1.png");
    }

    #[test]
    fn markdown_attachments_are_not_classified_as_images() {
        let vault = tempfile::tempdir().expect("vault");
        let root = vault.path().canonicalize().expect("canonical vault");
        fs::write(vault.path().join("Note.md"), "").expect("note");

        let imported = import_attachment(
            &root,
            "Note.md",
            std::ffi::OsStr::new("Reference.md"),
            |destination| {
                fs::write(destination, b"# Reference")?;
                Ok(())
            },
        )
        .expect("attachment import");

        assert_eq!(imported.vault_path, "attachments/Reference.md");
        assert_eq!(imported.markdown_path, "attachments/Reference.md");
        assert!(!imported.is_image);
    }

    #[test]
    fn resolves_pdf_relative_to_the_source_note() {
        let vault = tempfile::tempdir().expect("vault");
        fs::create_dir_all(vault.path().join("Projects/attachments")).expect("attachments");
        fs::write(vault.path().join("Projects/Plan.md"), "").expect("note");
        fs::write(
            vault.path().join("Projects/attachments/Reference.pdf"),
            b"%PDF",
        )
        .expect("pdf");

        assert_eq!(
            resolve_attachment(
                vault.path(),
                "Projects/Plan.md",
                "attachments/Reference.pdf#page=3"
            )
            .expect("resolution"),
            AttachmentResolution {
                status: AttachmentResolutionStatus::Resolved,
                path: Some("Projects/attachments/Reference.pdf".into()),
            }
        );
    }

    #[test]
    fn reports_ambiguous_pdf_filename_matches() {
        let vault = tempfile::tempdir().expect("vault");
        fs::create_dir_all(vault.path().join("One")).expect("one");
        fs::create_dir_all(vault.path().join("Two")).expect("two");
        fs::write(vault.path().join("Note.md"), "").expect("note");
        fs::write(vault.path().join("One/Reference.pdf"), b"%PDF").expect("first");
        fs::write(vault.path().join("Two/Reference.pdf"), b"%PDF").expect("second");

        assert_eq!(
            resolve_attachment(vault.path(), "Note.md", "Reference.pdf").expect("resolution"),
            AttachmentResolution {
                status: AttachmentResolutionStatus::Ambiguous,
                path: None,
            }
        );
    }
}
