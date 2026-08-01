//! Disposable SQLite index management and vault scanning.

use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Component, Path, PathBuf},
    time::{Duration, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;
use walkdir::WalkDir;

use crate::{
    commands::files::READONLY_FILE_BYTES,
    error::AppError,
    index::parser::{parse_note, ParsedNote},
    vault_path::{resolve_optional_existing, resolve_write_file, secure_directory},
};

pub const SCHEMA_VERSION: &str = "1";
const SCHEMA: &str = r#"
CREATE TABLE files(id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, title TEXT, mtime INTEGER, size INTEGER);
CREATE TABLE links(id INTEGER PRIMARY KEY, source_id INTEGER REFERENCES files(id) ON DELETE CASCADE, target_path TEXT NOT NULL, target_id INTEGER NULL, display TEXT, pos INTEGER);
CREATE TABLE tags(id INTEGER PRIMARY KEY, file_id INTEGER REFERENCES files(id) ON DELETE CASCADE, tag TEXT NOT NULL);
CREATE TABLE headings(id INTEGER PRIMARY KEY, file_id INTEGER REFERENCES files(id) ON DELETE CASCADE, level INTEGER, text TEXT, line INTEGER);
CREATE TABLE frontmatter(id INTEGER PRIMARY KEY, file_id INTEGER REFERENCES files(id) ON DELETE CASCADE, key TEXT, value TEXT);
CREATE VIRTUAL TABLE fts USING fts5(path, title, body, tokenize='porter unicode61');
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
"#;
const DROP_SCHEMA: &str = r#"
DROP TABLE IF EXISTS links;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS headings;
DROP TABLE IF EXISTS frontmatter;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS fts;
DROP TABLE IF EXISTS meta;
"#;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub processed: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ScanResult {
    pub changed_paths: Vec<String>,
    pub total_files: usize,
}

#[derive(Debug)]
struct DiskNote {
    path: String,
    absolute: PathBuf,
    mtime: i64,
    size: i64,
}

pub fn open(vault: &Path) -> Result<Connection, AppError> {
    secure_directory(vault, Path::new(".notem"), true)?;
    for sidecar in ["index.db-wal", "index.db-shm", "index.db-journal"] {
        resolve_write_file(vault, &format!(".notem/{sidecar}"), false)?;
    }
    let database_path = resolve_write_file(vault, ".notem/index.db", false)?;
    let mut connection = Connection::open(database_path)?;
    connection.busy_timeout(Duration::from_secs(5))?;
    connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;

    let has_meta: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='meta')",
        [],
        |row| row.get(0),
    )?;
    let version = if has_meta {
        connection
            .query_row(
                "SELECT value FROM meta WHERE key = 'schema_version'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?
    } else {
        None
    };
    if version.as_deref() != Some(SCHEMA_VERSION) {
        recreate_schema(&mut connection)?;
    }
    Ok(connection)
}

pub fn rebuild<F>(vault: &Path, progress: F) -> Result<ScanResult, AppError>
where
    F: FnMut(ScanProgress),
{
    let mut connection = open(vault)?;
    recreate_schema(&mut connection)?;
    drop(connection);
    full_scan(vault, progress)
}

fn recreate_schema(connection: &mut Connection) -> Result<(), AppError> {
    let transaction = connection.transaction()?;
    transaction.execute_batch(DROP_SCHEMA)?;
    transaction.execute_batch(SCHEMA)?;
    transaction.execute(
        "INSERT INTO meta(key, value) VALUES('schema_version', ?1)",
        [SCHEMA_VERSION],
    )?;
    transaction.commit()?;
    Ok(())
}

pub fn full_scan<F>(vault: &Path, mut progress: F) -> Result<ScanResult, AppError>
where
    F: FnMut(ScanProgress),
{
    let disk_notes = collect_markdown_files(vault)?;
    let total = disk_notes.len();
    let mut connection = open(vault)?;
    let transaction = connection.transaction()?;
    let known = known_files(&transaction)?;
    let disk_paths: HashSet<&str> = disk_notes.iter().map(|note| note.path.as_str()).collect();
    let mut changed_paths = Vec::new();

    for path in known
        .keys()
        .filter(|path| !disk_paths.contains(path.as_str()))
    {
        delete_note(&transaction, path)?;
        changed_paths.push(path.clone());
    }

    for (index, note) in disk_notes.iter().enumerate() {
        let unchanged = known
            .get(&note.path)
            .is_some_and(|(mtime, size)| *mtime == note.mtime && *size == note.size);
        if !unchanged {
            let content = read_indexable_content(&note.absolute, note.size)?;
            upsert_note(&transaction, note, &content)?;
            changed_paths.push(note.path.clone());
        }
        if total > 500 && ((index + 1) % 50 == 0 || index + 1 == total) {
            progress(ScanProgress {
                processed: index + 1,
                total,
            });
        }
    }
    resolve_links(&transaction)?;
    transaction.commit()?;
    changed_paths.sort();
    changed_paths.dedup();
    Ok(ScanResult {
        changed_paths,
        total_files: total,
    })
}

pub fn sync_paths(vault: &Path, paths: &[String]) -> Result<ScanResult, AppError> {
    let normalized: Vec<String> = paths
        .iter()
        .filter_map(|path| normalize_relative_markdown_path(path))
        .collect();
    let mut connection = open(vault)?;
    let transaction = connection.transaction()?;
    let mut changed_paths = Vec::new();
    for path in normalized {
        if let Some(absolute) =
            resolve_optional_existing(vault, &path)?.filter(|path| path.is_file())
        {
            let metadata = fs::metadata(&absolute)?;
            let note = DiskNote {
                path: path.clone(),
                absolute: absolute.clone(),
                mtime: metadata_mtime(&metadata)?,
                size: i64::try_from(metadata.len())
                    .map_err(|_| AppError::Message("file is too large to index".into()))?,
            };
            let content = read_indexable_content(&absolute, note.size)?;
            upsert_note(&transaction, &note, &content)?;
        } else {
            delete_note(&transaction, &path)?;
        }
        changed_paths.push(path);
    }
    resolve_links(&transaction)?;
    transaction.commit()?;
    changed_paths.sort();
    changed_paths.dedup();
    Ok(ScanResult {
        changed_paths,
        total_files: 0,
    })
}

fn read_indexable_content(path: &Path, size: i64) -> Result<String, AppError> {
    if size > i64::try_from(READONLY_FILE_BYTES).unwrap_or(i64::MAX) {
        return Ok(String::new());
    }
    Ok(String::from_utf8(fs::read(path)?).unwrap_or_default())
}

fn collect_markdown_files(vault: &Path) -> Result<Vec<DiskNote>, AppError> {
    let mut notes = Vec::new();
    for entry in WalkDir::new(vault)
        .into_iter()
        .filter_entry(|entry| entry.file_name() != ".notem")
    {
        let entry = entry.map_err(|error| AppError::Message(error.to_string()))?;
        if !entry.file_type().is_file()
            || !entry
                .path()
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
        {
            continue;
        }
        let metadata = entry
            .metadata()
            .map_err(|error| AppError::Io(error.into()))?;
        notes.push(DiskNote {
            path: relative_path(vault, entry.path())?,
            absolute: entry.path().to_path_buf(),
            mtime: metadata_mtime(&metadata)?,
            size: i64::try_from(metadata.len())
                .map_err(|_| AppError::Message("file is too large to index".into()))?,
        });
    }
    notes.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(notes)
}

fn known_files(transaction: &Transaction<'_>) -> Result<HashMap<String, (i64, i64)>, AppError> {
    let mut statement = transaction.prepare("SELECT path, mtime, size FROM files")?;
    let rows = statement.query_map([], |row| Ok((row.get(0)?, (row.get(1)?, row.get(2)?))))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn upsert_note(
    transaction: &Transaction<'_>,
    disk_note: &DiskNote,
    content: &str,
) -> Result<(), AppError> {
    let parsed = parse_note(&disk_note.path, content);
    transaction.execute(
        "INSERT INTO files(path, title, mtime, size) VALUES(?1, ?2, ?3, ?4)
         ON CONFLICT(path) DO UPDATE SET title=excluded.title, mtime=excluded.mtime, size=excluded.size",
        params![disk_note.path, parsed.title, disk_note.mtime, disk_note.size],
    )?;
    let file_id: i64 = transaction.query_row(
        "SELECT id FROM files WHERE path = ?1",
        [&disk_note.path],
        |row| row.get(0),
    )?;
    clear_metadata(transaction, file_id, &disk_note.path)?;
    insert_metadata(transaction, file_id, &parsed, content)?;
    Ok(())
}

fn clear_metadata(transaction: &Transaction<'_>, file_id: i64, path: &str) -> Result<(), AppError> {
    transaction.execute("DELETE FROM links WHERE source_id = ?1", [file_id])?;
    transaction.execute("DELETE FROM tags WHERE file_id = ?1", [file_id])?;
    transaction.execute("DELETE FROM headings WHERE file_id = ?1", [file_id])?;
    transaction.execute("DELETE FROM frontmatter WHERE file_id = ?1", [file_id])?;
    transaction.execute("DELETE FROM fts WHERE path = ?1", [path])?;
    Ok(())
}

fn insert_metadata(
    transaction: &Transaction<'_>,
    file_id: i64,
    parsed: &ParsedNote,
    content: &str,
) -> Result<(), AppError> {
    for link in &parsed.links {
        transaction.execute(
            "INSERT INTO links(source_id, target_path, target_id, display, pos)
             VALUES(?1, ?2, NULL, ?3, ?4)",
            params![
                file_id,
                link.target_path,
                link.display,
                i64::try_from(link.pos)
                    .map_err(|_| AppError::Message("link position is out of range".into()))?
            ],
        )?;
    }
    for tag in &parsed.tags {
        transaction.execute(
            "INSERT INTO tags(file_id, tag) VALUES(?1, ?2)",
            params![file_id, tag],
        )?;
    }
    for heading in &parsed.headings {
        transaction.execute(
            "INSERT INTO headings(file_id, level, text, line) VALUES(?1, ?2, ?3, ?4)",
            params![file_id, heading.level, heading.text, heading.line],
        )?;
    }
    for entry in &parsed.frontmatter {
        transaction.execute(
            "INSERT INTO frontmatter(file_id, key, value) VALUES(?1, ?2, ?3)",
            params![file_id, entry.key, entry.value],
        )?;
    }
    transaction.execute(
        "INSERT INTO fts(path, title, body) VALUES(?1, ?2, ?3)",
        params![parsed.path, parsed.title, content],
    )?;
    Ok(())
}

fn delete_note(transaction: &Transaction<'_>, path: &str) -> Result<(), AppError> {
    transaction.execute("DELETE FROM fts WHERE path = ?1", [path])?;
    transaction.execute("DELETE FROM files WHERE path = ?1", [path])?;
    Ok(())
}

fn resolve_links(transaction: &Transaction<'_>) -> Result<(), AppError> {
    let files = ResolutionIndex::load(transaction)?;
    transaction.execute("UPDATE links SET target_id = NULL", [])?;
    let mut statement = transaction.prepare(
        "SELECT links.id, links.target_path, files.path
         FROM links JOIN files ON files.id = links.source_id",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    let links = rows.collect::<Result<Vec<_>, _>>()?;
    drop(statement);
    for (link_id, target, source) in links {
        if let Some(target_id) = files.resolve(&source, &target) {
            transaction.execute(
                "UPDATE links SET target_id = ?1 WHERE id = ?2",
                params![target_id, link_id],
            )?;
        }
    }
    Ok(())
}

struct ResolutionIndex {
    exact: HashMap<String, Vec<i64>>,
    filenames: HashMap<String, Vec<i64>>,
}

impl ResolutionIndex {
    fn load(transaction: &Transaction<'_>) -> Result<Self, AppError> {
        let mut statement = transaction.prepare("SELECT id, path FROM files")?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut index = Self {
            exact: HashMap::new(),
            filenames: HashMap::new(),
        };
        for row in rows {
            let (id, path) = row?;
            let identity = note_identity(&path);
            index
                .exact
                .entry(identity.to_lowercase())
                .or_default()
                .push(id);
            if let Some(filename) = Path::new(&identity)
                .file_name()
                .and_then(|name| name.to_str())
            {
                index
                    .filenames
                    .entry(filename.to_lowercase())
                    .or_default()
                    .push(id);
            }
        }
        Ok(index)
    }

    fn resolve(&self, source: &str, target: &str) -> Option<i64> {
        let target = strip_markdown_extension(target.trim_matches('/'));
        let source_parent = Path::new(source).parent().unwrap_or_else(|| Path::new(""));
        let source_relative = normalize_identity_path(&source_parent.join(target));
        for candidate in [target.to_owned(), source_relative] {
            if let Some(id) = unique_id(self.exact.get(&candidate.to_lowercase())) {
                return Some(id);
            }
        }
        let target_name = Path::new(target).file_name()?.to_str()?.to_lowercase();
        unique_id(self.filenames.get(&target_name))
    }
}

fn unique_id(ids: Option<&Vec<i64>>) -> Option<i64> {
    ids.filter(|ids| ids.len() == 1)
        .and_then(|ids| ids.first().copied())
}

pub fn inbound_link_positions(
    vault: &Path,
    old_path: &str,
) -> Result<HashMap<String, HashSet<usize>>, AppError> {
    let connection = open(vault)?;
    let Some(target_id) = connection
        .query_row("SELECT id FROM files WHERE path = ?1", [old_path], |row| {
            row.get::<_, i64>(0)
        })
        .optional()?
    else {
        return Ok(HashMap::new());
    };
    let mut statement = connection.prepare(
        "SELECT files.path, links.pos FROM links
         JOIN files ON files.id = links.source_id
         WHERE links.target_id = ?1",
    )?;
    let rows = statement.query_map([target_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    let mut positions: HashMap<String, HashSet<usize>> = HashMap::new();
    for row in rows {
        let (path, pos) = row?;
        if let Ok(pos) = usize::try_from(pos) {
            positions.entry(path).or_default().insert(pos);
        }
    }
    Ok(positions)
}

pub fn note_identity(path: &str) -> String {
    strip_markdown_extension(path).replace('\\', "/")
}

pub fn relative_path(vault: &Path, absolute: &Path) -> Result<String, AppError> {
    let relative = absolute
        .strip_prefix(vault)
        .map_err(|_| AppError::InvalidPath(absolute.to_string_lossy().into_owned()))?;
    let parts: Option<Vec<&str>> = relative
        .components()
        .map(|component| match component {
            Component::Normal(part) => part.to_str(),
            _ => None,
        })
        .collect();
    parts
        .map(|parts| parts.join("/"))
        .ok_or_else(|| AppError::InvalidPath(relative.to_string_lossy().into_owned()))
}

fn normalize_relative_markdown_path(path: &str) -> Option<String> {
    let path = path.replace('\\', "/");
    Path::new(&path)
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
        .then_some(path)
}

fn normalize_identity_path(path: &Path) -> String {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().into_owned()),
            Component::ParentDir => {
                parts.pop();
            }
            _ => {}
        }
    }
    note_identity(&parts.join("/"))
}

fn strip_markdown_extension(path: &str) -> &str {
    path.get(path.len().saturating_sub(3)..)
        .filter(|extension| extension.eq_ignore_ascii_case(".md"))
        .and_then(|_| path.get(..path.len() - 3))
        .unwrap_or(path)
}

fn metadata_mtime(metadata: &fs::Metadata) -> Result<i64, AppError> {
    let duration = metadata
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map_err(|_| AppError::Message("file modification time predates Unix epoch".into()))?;
    i64::try_from(duration.as_micros())
        .map_err(|_| AppError::Message("file modification time is out of range".into()))
}
