//! Tag query command handlers.

use std::fs;

use serde::Serialize;
use tauri::State;

use crate::{
    commands::{
        files::{modified_timestamp, resolve_existing, FileContents, FileKind},
        vault::{vault_root, CurrentVault},
    },
    error::AppError,
    index::db,
};

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub count: usize,
}

#[tauri::command]
pub fn tags_all(state: State<'_, CurrentVault>) -> Result<Vec<TagCount>, AppError> {
    let root = vault_root(&state)?;
    let connection = db::open(&root)?;
    let mut statement = connection.prepare(
        "SELECT lower(tag) AS normalized, COUNT(DISTINCT file_id)
         FROM tags
         GROUP BY normalized
         ORDER BY normalized",
    )?;
    let rows = statement.query_map([], |row| {
        let count: i64 = row.get(1)?;
        Ok(TagCount {
            tag: row.get(0)?,
            count: usize::try_from(count).unwrap_or(0),
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Heading {
    pub level: u8,
    pub text: String,
    pub line: usize,
}

#[tauri::command]
pub fn outline_headings(
    path: String,
    state: State<'_, CurrentVault>,
) -> Result<Vec<Heading>, AppError> {
    let root = vault_root(&state)?;
    let connection = db::open(&root)?;
    let mut statement = connection.prepare(
        "SELECT headings.level, headings.text, headings.line
         FROM headings
         JOIN files ON files.id = headings.file_id
         WHERE files.path = ?1
         ORDER BY headings.line",
    )?;
    let rows = statement.query_map([path], |row| {
        let level: i64 = row.get(0)?;
        let line: i64 = row.get(2)?;
        Ok(Heading {
            level: u8::try_from(level).unwrap_or(1),
            text: row.get(1)?,
            line: usize::try_from(line).unwrap_or(1),
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[tauri::command]
pub fn outline_move(
    path: String,
    from_line: usize,
    to_line: usize,
    after: bool,
    known_mtime: i64,
    state: State<'_, CurrentVault>,
) -> Result<FileContents, AppError> {
    let root = vault_root(&state)?;
    let absolute = resolve_existing(&root, &path)?;
    if modified_timestamp(&absolute)? > known_mtime {
        return Err(AppError::Conflict(path));
    }
    let original = fs::read_to_string(&absolute)?;
    let content = move_heading_section(&original, from_line, to_line, after)?;
    fs::write(&absolute, &content)?;
    db::sync_paths(&root, std::slice::from_ref(&path))?;
    Ok(FileContents {
        size: fs::metadata(&absolute)?.len(),
        mtime: modified_timestamp(&absolute)?,
        content,
        kind: FileKind::Text,
        readonly: false,
        warning: None,
    })
}

fn move_heading_section(
    content: &str,
    from_line: usize,
    to_line: usize,
    after: bool,
) -> Result<String, AppError> {
    let mut lines: Vec<String> = content.split_inclusive('\n').map(str::to_owned).collect();
    if content.is_empty() {
        return Ok(String::new());
    }
    let source = from_line
        .checked_sub(1)
        .filter(|index| *index < lines.len())
        .ok_or_else(|| AppError::Message("source heading is out of range".into()))?;
    let target = to_line
        .checked_sub(1)
        .filter(|index| *index < lines.len())
        .ok_or_else(|| AppError::Message("target heading is out of range".into()))?;
    let source_level = heading_level(&lines[source])
        .ok_or_else(|| AppError::Message("source line is not a heading".into()))?;
    let target_level = heading_level(&lines[target])
        .ok_or_else(|| AppError::Message("target line is not a heading".into()))?;
    let source_end = section_end(&lines, source, source_level);
    let insertion = if after {
        section_end(&lines, target, target_level)
    } else {
        target
    };
    if source == target || (insertion >= source && insertion <= source_end) {
        return Ok(content.to_owned());
    }
    let section: Vec<String> = lines.drain(source..source_end).collect();
    let insertion = if insertion > source_end {
        insertion - section.len()
    } else {
        insertion
    };
    lines.splice(insertion..insertion, section);
    Ok(lines.concat())
}

fn heading_level(line: &str) -> Option<usize> {
    let trimmed = line.trim_start();
    let hashes = trimmed.bytes().take_while(|byte| *byte == b'#').count();
    (hashes > 0
        && hashes <= 6
        && trimmed
            .as_bytes()
            .get(hashes)
            .is_some_and(u8::is_ascii_whitespace))
    .then_some(hashes)
}

fn section_end(lines: &[String], start: usize, level: usize) -> usize {
    lines
        .iter()
        .enumerate()
        .skip(start + 1)
        .find_map(|(index, line)| {
            heading_level(line)
                .is_some_and(|candidate| candidate <= level)
                .then_some(index)
        })
        .unwrap_or(lines.len())
}

#[cfg(test)]
mod tests {
    use super::move_heading_section;

    #[test]
    fn moves_a_heading_with_its_child_section() {
        let source = "# One\nA\n## Child\nB\n# Two\nC\n";
        let moved = move_heading_section(source, 1, 5, true).expect("move");
        assert_eq!(moved, "# Two\nC\n# One\nA\n## Child\nB\n");
    }

    #[test]
    fn moves_a_section_before_another_heading() {
        let source = "# One\nA\n# Two\nB\n# Three\nC\n";
        let moved = move_heading_section(source, 5, 1, false).expect("move");
        assert_eq!(moved, "# Three\nC\n# One\nA\n# Two\nB\n");
    }
}
