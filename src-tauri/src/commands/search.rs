//! Full-text and filename search command handlers.

use std::{path::Path, time::Instant};

use rusqlite::{params_from_iter, types::Value, Connection};
use serde::Serialize;
use tauri::State;

use crate::{
    commands::performance::PerformanceState,
    commands::vault::{vault_root, CurrentVault},
    error::AppError,
    index::db,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilenameMatch {
    pub path: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub line: usize,
    pub score: f64,
}

#[derive(Debug, Default, PartialEq, Eq)]
struct SearchQuery {
    terms: Vec<String>,
    tags: Vec<String>,
    paths: Vec<String>,
}

#[tauri::command]
pub fn search_fts(
    query: String,
    limit: Option<usize>,
    state: State<'_, CurrentVault>,
    performance: State<'_, PerformanceState>,
) -> Result<Vec<SearchMatch>, AppError> {
    let started = Instant::now();
    let root = vault_root(&state)?;
    let connection = db::open(&root)?;
    let results = search_connection(&connection, &query, limit.unwrap_or(100))?;
    performance.record_search(started.elapsed().as_secs_f64() * 1_000.0);
    Ok(results)
}

pub fn search_connection(
    connection: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchMatch>, AppError> {
    let parsed = parse_search_query(query);
    if parsed.terms.is_empty() && parsed.tags.is_empty() && parsed.paths.is_empty() {
        return Ok(Vec::new());
    }

    let mut clauses = Vec::new();
    let mut values = Vec::new();
    let has_terms = !parsed.terms.is_empty();
    if has_terms {
        clauses.push("fts MATCH ?".to_owned());
        values.push(Value::Text(parsed.terms.join(" AND ")));
    }
    for tag in parsed.tags {
        clauses.push(
            "EXISTS (
                SELECT 1 FROM tags
                JOIN files tag_file ON tag_file.id = tags.file_id
                WHERE tag_file.path = fts.path AND lower(tags.tag) = lower(?)
            )"
            .to_owned(),
        );
        values.push(Value::Text(tag));
    }
    for path in parsed.paths {
        clauses.push("lower(fts.path) LIKE lower(?) ESCAPE '\\'".to_owned());
        values.push(Value::Text(format!(
            "%{}%",
            path.replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        )));
    }
    values.push(Value::Integer(i64::try_from(limit.clamp(1, 500)).map_err(
        |_| AppError::Message("search limit is out of range".into()),
    )?));

    let (snippet, highlighted, score, order) = if has_terms {
        (
            "snippet(fts, 2, char(57344), char(57345), ' … ', 28)",
            "highlight(fts, 2, char(57344), char(57345))",
            "bm25(fts, 8.0, 4.0, 1.0)",
            "score ASC, lower(fts.path) ASC",
        )
    } else {
        (
            "substr(fts.body, 1, 220)",
            "fts.body",
            "0.0",
            "lower(fts.path) ASC",
        )
    };
    let sql = format!(
        "SELECT fts.path, COALESCE(files.title, fts.title, ''), {snippet}, {highlighted},
                {score} AS score
         FROM fts
         LEFT JOIN files ON files.path = fts.path
         WHERE {}
         ORDER BY {order}
         LIMIT ?",
        clauses.join(" AND ")
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(values), |row| {
        let highlighted: String = row.get(3)?;
        let marker = highlighted.find('\u{e000}').unwrap_or(0);
        let line = highlighted[..marker]
            .bytes()
            .filter(|byte| *byte == b'\n')
            .count()
            + 1;
        Ok(SearchMatch {
            path: row.get(0)?,
            title: row.get(1)?,
            snippet: row.get(2)?,
            line,
            score: row.get(4)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn parse_search_query(query: &str) -> SearchQuery {
    let mut parsed = SearchQuery::default();
    for token in tokenize_query(query) {
        if let Some(value) = token
            .strip_prefix("tag:")
            .or_else(|| token.strip_prefix("TAG:"))
        {
            let tag = value.trim().trim_start_matches('#');
            if !tag.is_empty() {
                parsed.tags.push(tag.to_owned());
            }
        } else if let Some(value) = token
            .strip_prefix("path:")
            .or_else(|| token.strip_prefix("PATH:"))
        {
            let path = value.trim();
            if !path.is_empty() {
                parsed.paths.push(path.to_owned());
            }
        } else if !token.trim().is_empty() {
            parsed.terms.push(fts_quote(&token));
        }
    }
    parsed
}

fn tokenize_query(query: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    for character in query.chars() {
        match character {
            '"' => quoted = !quoted,
            character if character.is_whitespace() && !quoted => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            character => current.push(character),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn fts_quote(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

#[tauri::command]
pub fn search_filename(
    query: String,
    limit: Option<usize>,
    state: State<'_, CurrentVault>,
) -> Result<Vec<FilenameMatch>, AppError> {
    let root = vault_root(&state)?;
    let connection = db::open(&root)?;
    let mut statement = connection.prepare("SELECT path, COALESCE(title, '') FROM files")?;
    let rows = statement.query_map([], |row| {
        Ok(FilenameMatch {
            path: row.get(0)?,
            title: row.get(1)?,
        })
    })?;
    let needle = query.trim().trim_end_matches(".md").to_lowercase();
    let mut matches = rows
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .filter_map(|candidate| {
            let identity = db::note_identity(&candidate.path);
            let filename = Path::new(&identity)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(&identity);
            filename_score(&needle, filename, &candidate.title, &identity)
                .map(|score| (score, candidate))
        })
        .collect::<Vec<_>>();
    matches.sort_by(|(left_score, left), (right_score, right)| {
        left_score
            .cmp(right_score)
            .then_with(|| left.path.to_lowercase().cmp(&right.path.to_lowercase()))
            .then_with(|| left.path.cmp(&right.path))
    });
    let limit = limit.unwrap_or(50).clamp(1, 100);
    Ok(matches
        .into_iter()
        .take(limit)
        .map(|(_, candidate)| candidate)
        .collect())
}

fn filename_score(needle: &str, filename: &str, title: &str, path: &str) -> Option<(u8, usize)> {
    if needle.is_empty() {
        return Some((4, path.len()));
    }
    let filename = filename.to_lowercase();
    let title = title.to_lowercase();
    let path = path.to_lowercase();
    if filename == needle || path == needle {
        return Some((0, path.len()));
    }
    if filename.starts_with(needle) || title.starts_with(needle) {
        return Some((1, path.len()));
    }
    if filename.contains(needle) || title.contains(needle) || path.contains(needle) {
        return Some((2, path.len()));
    }
    fuzzy_distance(needle, &format!("{title} {path}")).map(|distance| (3, distance))
}

fn fuzzy_distance(needle: &str, haystack: &str) -> Option<usize> {
    let mut chars = needle.chars();
    let mut expected = chars.next()?;
    let mut span = 0;
    let mut started = false;
    for character in haystack.chars() {
        if character == expected {
            started = true;
            if let Some(next) = chars.next() {
                expected = next;
            } else {
                return Some(span);
            }
        }
        if started {
            span += 1;
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{parse_search_query, SearchQuery};

    #[test]
    fn parses_filters_and_exact_phrases() {
        assert_eq!(
            parse_search_query(r#"alpha "exact phrase" tag:#rust path:Projects/"#),
            SearchQuery {
                terms: vec!["\"alpha\"".into(), "\"exact phrase\"".into()],
                tags: vec!["rust".into()],
                paths: vec!["Projects/".into()],
            }
        );
    }
}
