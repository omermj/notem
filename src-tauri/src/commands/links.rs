//! Backlink and graph command handlers.

use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    ops::Range,
    path::Path,
};

use regex::RegexBuilder;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use tauri::State;

use crate::{
    commands::vault::{vault_root, CurrentVault},
    error::AppError,
    index::db,
    vault_path::resolve_existing,
};

const HIGHLIGHT_START: char = '\u{e000}';
const HIGHLIGHT_END: char = '\u{e001}';

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkMention {
    pub path: String,
    pub snippet: String,
    pub line: usize,
    pub start: usize,
    pub end: usize,
    pub text: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Backlinks {
    pub linked: Vec<BacklinkMention>,
    pub unlinked: Vec<BacklinkMention>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    pub title: String,
    pub links_count: usize,
    pub ghost: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LinkGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[tauri::command]
pub fn links_backlinks(
    path: String,
    state: State<'_, CurrentVault>,
) -> Result<Backlinks, AppError> {
    let root = vault_root(&state)?;
    backlinks_for_vault(&root, &path)
}

pub fn backlinks_for_vault(root: &std::path::Path, path: &str) -> Result<Backlinks, AppError> {
    let connection = db::open(root)?;
    let target = connection
        .query_row(
            "SELECT id, COALESCE(title, '') FROM files WHERE path = ?1",
            [path],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?
        .ok_or_else(|| AppError::Message(format!("note is not indexed: {path}")))?;

    let mut statement = connection.prepare(
        "SELECT files.path, links.pos
         FROM links
         JOIN files ON files.id = links.source_id
         WHERE links.target_id = ?1
         ORDER BY lower(files.path), links.pos",
    )?;
    let linked_rows = statement
        .query_map([target.0], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut linked = Vec::new();
    for (source, position) in linked_rows {
        let content = fs::read_to_string(resolve_existing(root, &source)?)?;
        let start = usize::try_from(position).unwrap_or(0).min(content.len());
        let range = wikilink_range_at(&content, start).unwrap_or(start..start);
        linked.push(mention(&source, &content, range));
    }

    let title = if target.1.trim().is_empty() {
        db::note_identity(path)
            .rsplit('/')
            .next()
            .unwrap_or(path)
            .to_owned()
    } else {
        target.1
    };
    let mut unlinked = Vec::new();
    if !title.trim().is_empty() {
        let matcher = RegexBuilder::new(&regex::escape(&title))
            .case_insensitive(true)
            .unicode(true)
            .build()
            .map_err(|error| AppError::Message(error.to_string()))?;
        let mut candidates = connection.prepare(
            "SELECT fts.path, fts.body
             FROM fts
             WHERE fts MATCH ?1 AND fts.path <> ?2
             ORDER BY lower(fts.path)",
        )?;
        let phrase = format!("\"{}\"", title.replace('"', "\"\""));
        let rows = candidates.query_map(params![phrase, path], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (source, content) = row?;
            for found in matcher.find_iter(&content) {
                if !inside_wikilink(&content, found.start()) {
                    unlinked.push(mention(&source, &content, found.range()));
                }
            }
        }
    }
    Ok(Backlinks { linked, unlinked })
}

#[tauri::command]
pub fn links_graph(state: State<'_, CurrentVault>) -> Result<LinkGraph, AppError> {
    let root = vault_root(&state)?;
    links_graph_for_vault(&root)
}

pub fn links_graph_for_vault(root: &Path) -> Result<LinkGraph, AppError> {
    let connection = db::open(root)?;
    let mut nodes = BTreeMap::new();
    let mut files = connection.prepare(
        "SELECT path, COALESCE(NULLIF(trim(title), ''), '') FROM files ORDER BY lower(path)",
    )?;
    let rows = files.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (path, title) = row?;
        let id = db::note_identity(&path);
        let fallback = id.rsplit('/').next().unwrap_or(&id).to_owned();
        nodes.insert(
            id.clone(),
            GraphNode {
                id,
                title: if title.is_empty() { fallback } else { title },
                links_count: 0,
                ghost: false,
            },
        );
    }
    drop(files);

    let mut edges = BTreeSet::new();
    let mut links = connection.prepare(
        "SELECT source.path, links.target_path, target.path
         FROM links
         JOIN files source ON source.id = links.source_id
         LEFT JOIN files target ON target.id = links.target_id
         ORDER BY lower(source.path), links.pos",
    )?;
    let rows = links.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    for row in rows {
        let (source_path, raw_target, resolved_path) = row?;
        let source = db::note_identity(&source_path);
        let target = resolved_path
            .as_deref()
            .map(db::note_identity)
            .unwrap_or_else(|| ghost_identity(&raw_target));
        if target.is_empty() {
            continue;
        }
        if resolved_path.is_none() {
            nodes.entry(target.clone()).or_insert_with(|| GraphNode {
                id: target.clone(),
                title: target.rsplit('/').next().unwrap_or(&target).to_owned(),
                links_count: 0,
                ghost: true,
            });
        }
        edges.insert(GraphEdge { source, target });
    }

    for edge in &edges {
        if let Some(node) = nodes.get_mut(&edge.source) {
            node.links_count += 1;
        }
        if edge.target != edge.source {
            if let Some(node) = nodes.get_mut(&edge.target) {
                node.links_count += 1;
            }
        }
    }

    Ok(LinkGraph {
        nodes: nodes.into_values().collect(),
        edges: edges.into_iter().collect(),
    })
}

fn ghost_identity(target: &str) -> String {
    db::note_identity(target.trim().trim_matches('/'))
        .replace('\\', "/")
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .fold(Vec::new(), |mut parts, part| {
            if part == ".." {
                parts.pop();
            } else {
                parts.push(part);
            }
            parts
        })
        .join("/")
}

#[tauri::command]
pub fn links_link_unlinked(
    source_path: String,
    start: usize,
    end: usize,
    expected_text: String,
    state: State<'_, CurrentVault>,
) -> Result<(), AppError> {
    let root = vault_root(&state)?;
    link_unlinked_for_vault(&root, &source_path, start, end, &expected_text)
}

pub fn link_unlinked_for_vault(
    root: &std::path::Path,
    source_path: &str,
    start: usize,
    end: usize,
    expected_text: &str,
) -> Result<(), AppError> {
    let absolute = resolve_existing(root, source_path)?;
    let mut content = fs::read_to_string(&absolute)?;
    if start > end
        || end > content.len()
        || !content.is_char_boundary(start)
        || !content.is_char_boundary(end)
        || content.get(start..end) != Some(expected_text)
    {
        return Err(AppError::Conflict(source_path.to_owned()));
    }
    content.insert_str(end, "]]");
    content.insert_str(start, "[[");
    fs::write(&absolute, content)?;
    db::sync_paths(root, &[source_path.to_owned()])?;
    Ok(())
}

fn wikilink_range_at(content: &str, position: usize) -> Option<Range<usize>> {
    let tail = content.get(position..)?;
    let end = tail.find("]]")? + position + 2;
    Some(position..end)
}

fn inside_wikilink(content: &str, position: usize) -> bool {
    let line_start = content[..position].rfind('\n').map_or(0, |index| index + 1);
    let before = &content[line_start..position];
    before
        .rfind("[[")
        .is_some_and(|open| before[open + 2..].rfind("]]").is_none())
}

fn mention(path: &str, content: &str, range: Range<usize>) -> BacklinkMention {
    let line = content[..range.start]
        .bytes()
        .filter(|byte| *byte == b'\n')
        .count()
        + 1;
    let context_start = content[..range.start]
        .rfind('\n')
        .map_or(0, |index| index + 1);
    let context_end = content[range.end..]
        .find('\n')
        .map_or(content.len(), |index| range.end + index);
    let context = &content[context_start..context_end];
    let leading = context.len().saturating_sub(context.trim_start().len());
    let mut snippet = context.trim().to_owned();
    let local_start = range
        .start
        .saturating_sub(context_start)
        .saturating_sub(leading);
    let local_end = range
        .end
        .saturating_sub(context_start)
        .saturating_sub(leading);
    if local_end <= snippet.len() && local_start <= local_end {
        snippet.insert(local_end, HIGHLIGHT_END);
        snippet.insert(local_start, HIGHLIGHT_START);
    }
    BacklinkMention {
        path: path.to_owned(),
        snippet,
        line,
        start: range.start,
        end: range.end,
        text: content.get(range).unwrap_or("").to_owned(),
    }
}
