//! Pure Markdown metadata extraction for the disposable index.

use std::{collections::BTreeSet, path::Path, sync::LazyLock};

use regex::Regex;
use serde_yaml::Value;

static WIKILINK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[\[([^\]\|\n]+?)(?:\|([^\]\n]+?))?\]\]").expect("wikilink regex is valid")
});
static HEADING_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$").expect("heading regex is valid")
});
static TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?m)(^|[^\p{L}\p{N}_/#])#([\p{L}\p{N}_][\p{L}\p{N}_-]*(?:/[\p{L}\p{N}_][\p{L}\p{N}_-]*)*)",
    )
    .expect("tag regex is valid")
});

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedNote {
    pub path: String,
    pub title: String,
    pub links: Vec<ParsedLink>,
    pub tags: Vec<String>,
    pub headings: Vec<ParsedHeading>,
    pub frontmatter: Vec<FrontmatterEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedLink {
    /// Vault-relative note identity as written, without a heading or `.md`.
    pub target_path: String,
    pub display: Option<String>,
    pub pos: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedHeading {
    pub level: u8,
    pub text: String,
    /// One-based line number.
    pub line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontmatterEntry {
    pub key: String,
    pub value: String,
}

pub fn parse_note(path: &str, content: &str) -> ParsedNote {
    let (frontmatter, yaml_title, yaml_tags, frontmatter_end) = parse_frontmatter(content);
    let masked = mask_code(content, frontmatter_end);
    let links = parse_links(&masked);
    let headings = parse_headings(content, &masked);
    let mut tags = parse_tags(&masked);
    tags.extend(yaml_tags);
    tags.sort_by_key(|tag| tag.to_lowercase());
    tags.dedup_by(|left, right| left.eq_ignore_ascii_case(right));

    let filename_title = Path::new(path)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or(path)
        .to_owned();
    let title = yaml_title
        .filter(|title| !title.trim().is_empty())
        .or_else(|| {
            headings
                .iter()
                .find(|heading| heading.level == 1)
                .map(|heading| heading.text.clone())
        })
        .unwrap_or(filename_title);

    ParsedNote {
        path: path.to_owned(),
        title,
        links,
        tags,
        headings,
        frontmatter,
    }
}

fn parse_frontmatter(content: &str) -> (Vec<FrontmatterEntry>, Option<String>, Vec<String>, usize) {
    let mut lines = content.split_inclusive('\n');
    let Some(first) = lines.next() else {
        return (Vec::new(), None, Vec::new(), 0);
    };
    if first.trim_end_matches(['\r', '\n']) != "---" {
        return (Vec::new(), None, Vec::new(), 0);
    }

    let mut end = first.len();
    let mut yaml_end = None;
    for line in lines {
        let line_start = end;
        end += line.len();
        if line.trim_end_matches(['\r', '\n']) == "---" {
            yaml_end = Some((line_start, end));
            break;
        }
    }
    let Some((yaml_end, block_end)) = yaml_end else {
        return (Vec::new(), None, Vec::new(), 0);
    };

    let yaml = &content[first.len()..yaml_end];
    let Ok(Value::Mapping(mapping)) = serde_yaml::from_str::<Value>(yaml) else {
        return (Vec::new(), None, Vec::new(), block_end);
    };

    let mut entries = Vec::new();
    let mut title = None;
    let mut tags = Vec::new();
    for (key, value) in mapping {
        let Some(key) = scalar_string(&key) else {
            continue;
        };
        if key == "title" {
            title = scalar_string(&value);
        } else if key == "tags" {
            collect_yaml_tags(&value, &mut tags);
        }
        entries.push(FrontmatterEntry {
            key,
            value: yaml_value_string(&value),
        });
    }
    (entries, title, tags, block_end)
}

fn scalar_string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        _ => None,
    }
}

fn yaml_value_string(value: &Value) -> String {
    scalar_string(value).unwrap_or_else(|| {
        serde_yaml::to_string(value)
            .unwrap_or_default()
            .trim()
            .to_owned()
    })
}

fn collect_yaml_tags(value: &Value, tags: &mut Vec<String>) {
    match value {
        Value::Sequence(values) => {
            for value in values {
                if let Some(tag) = scalar_string(value) {
                    push_frontmatter_tag(&tag, tags);
                }
            }
        }
        Value::String(value) => {
            for tag in value
                .trim_matches(['[', ']'])
                .split([',', ' '])
                .filter(|tag| !tag.is_empty())
            {
                push_frontmatter_tag(tag, tags);
            }
        }
        _ => {}
    }
}

fn push_frontmatter_tag(tag: &str, tags: &mut Vec<String>) {
    let tag = tag.trim().trim_start_matches('#');
    if !tag.is_empty() {
        tags.push(tag.to_owned());
    }
}

fn mask_code(content: &str, frontmatter_end: usize) -> String {
    let mut bytes = content.as_bytes().to_vec();
    let masked_frontmatter_end = frontmatter_end.min(bytes.len());
    for byte in &mut bytes[..masked_frontmatter_end] {
        if *byte != b'\n' && *byte != b'\r' {
            *byte = b' ';
        }
    }

    let mut offset = 0;
    let mut fence: Option<(u8, usize)> = None;
    for line in content.split_inclusive('\n') {
        let trimmed = line.trim_start();
        let marker = trimmed.as_bytes().first().copied();
        let marker_len = marker
            .filter(|marker| *marker == b'`' || *marker == b'~')
            .map(|marker| {
                trimmed
                    .as_bytes()
                    .iter()
                    .take_while(|byte| **byte == marker)
                    .count()
            })
            .unwrap_or(0);

        let is_fence_line = marker_len >= 3
            && match fence {
                None => true,
                Some((open_marker, open_len)) => {
                    marker == Some(open_marker) && marker_len >= open_len
                }
            };
        if fence.is_some() || is_fence_line {
            mask_range(&mut bytes, offset, offset + line.len());
        }
        if is_fence_line {
            if fence.is_some() {
                fence = None;
            } else if let Some(marker) = marker {
                fence = Some((marker, marker_len));
            }
        }
        offset += line.len();
    }

    mask_inline_code(&mut bytes);
    // Masking replaces bytes only with ASCII spaces and preserves UTF-8 boundaries.
    String::from_utf8(bytes).unwrap_or_else(|_| content.to_owned())
}

fn mask_inline_code(bytes: &mut [u8]) {
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'`' {
            index += 1;
            continue;
        }
        let run = bytes[index..]
            .iter()
            .take_while(|byte| **byte == b'`')
            .count();
        let mut cursor = index + run;
        let mut closing = None;
        while cursor < bytes.len() && bytes[cursor] != b'\n' && bytes[cursor] != b'\r' {
            if bytes[cursor] == b'`' {
                let close_run = bytes[cursor..]
                    .iter()
                    .take_while(|byte| **byte == b'`')
                    .count();
                if close_run == run {
                    closing = Some(cursor + close_run);
                    break;
                }
                cursor += close_run;
            } else {
                cursor += 1;
            }
        }
        if let Some(end) = closing {
            mask_range(bytes, index, end);
            index = end;
        } else {
            index += run;
        }
    }
}

fn mask_range(bytes: &mut [u8], start: usize, end: usize) {
    let bounded_end = end.min(bytes.len());
    for byte in &mut bytes[start..bounded_end] {
        if *byte != b'\n' && *byte != b'\r' {
            *byte = b' ';
        }
    }
}

fn parse_links(masked: &str) -> Vec<ParsedLink> {
    WIKILINK_RE
        .captures_iter(masked)
        .filter_map(|captures| {
            let complete = captures.get(0)?;
            let raw_target = captures.get(1)?.as_str().trim();
            let target_path = raw_target
                .split_once('#')
                .map_or(raw_target, |(path, _)| path)
                .trim();
            let target_path = target_path
                .get(target_path.len().saturating_sub(3)..)
                .filter(|extension| extension.eq_ignore_ascii_case(".md"))
                .and_then(|_| target_path.get(..target_path.len() - 3))
                .unwrap_or(target_path);
            if target_path.is_empty() {
                return None;
            }
            Some(ParsedLink {
                target_path: target_path.replace('\\', "/"),
                display: captures
                    .get(2)
                    .map(|display| display.as_str().trim().to_owned()),
                pos: complete.start(),
            })
        })
        .collect()
}

fn parse_headings(content: &str, masked: &str) -> Vec<ParsedHeading> {
    content
        .lines()
        .zip(masked.lines())
        .enumerate()
        .filter_map(|(index, (original, clean))| {
            let captures = HEADING_RE.captures(clean)?;
            let level = captures.get(1)?.as_str().len() as u8;
            let text_start = captures.get(2)?.start();
            let text_end = captures.get(2)?.end();
            Some(ParsedHeading {
                level,
                text: original.get(text_start..text_end)?.trim().to_owned(),
                line: index + 1,
            })
        })
        .collect()
}

fn parse_tags(masked: &str) -> Vec<String> {
    let mut tags = BTreeSet::new();
    for captures in TAG_RE.captures_iter(masked) {
        let Some(tag) = captures.get(2) else {
            continue;
        };
        let valid_end = masked[tag.end()..]
            .chars()
            .next()
            .is_none_or(|next| !next.is_alphanumeric() && !matches!(next, '_' | '/' | '-'));
        if valid_end {
            tags.insert(tag.as_str().to_owned());
        }
    }
    tags.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::parse_note;

    #[test]
    fn title_precedence_is_frontmatter_then_h1_then_filename() {
        assert_eq!(
            parse_note("Folder/File.md", "---\ntitle: YAML title\n---\n# Heading").title,
            "YAML title"
        );
        assert_eq!(parse_note("Folder/File.md", "# Heading").title, "Heading");
        assert_eq!(parse_note("Folder/File.md", "body").title, "File");
    }

    #[test]
    fn extracts_wikilink_forms_and_heading_targets() {
        let note = parse_note(
            "Note.md",
            "[[Target]] [[Folder/Other|label]] [[Target#Section]]",
        );
        assert_eq!(note.links.len(), 3);
        assert_eq!(note.links[0].target_path, "Target");
        assert_eq!(note.links[1].target_path, "Folder/Other");
        assert_eq!(note.links[1].display.as_deref(), Some("label"));
        assert_eq!(note.links[2].target_path, "Target");
    }

    #[test]
    fn extracts_nested_tags_with_boundaries() {
        let note = parse_note(
            "Note.md",
            "#tag #nested/tag word#no /#no ##heading #bad/ #good-tag",
        );
        assert_eq!(note.tags, vec!["good-tag", "nested/tag", "tag"]);
    }

    #[test]
    fn includes_frontmatter_tags_and_key_values() {
        let note = parse_note(
            "Note.md",
            "---\ntitle: Test\ntags:\n  - docs\n  - nested/reference\ncount: 2\n---\n#docs",
        );
        assert_eq!(note.tags, vec!["docs", "nested/reference"]);
        assert_eq!(note.frontmatter.len(), 3);
        assert!(note
            .frontmatter
            .iter()
            .any(|entry| entry.key == "count" && entry.value == "2"));
    }

    #[test]
    fn extracts_headings_with_one_based_line_numbers() {
        let note = parse_note("Note.md", "text\n# One\n\n### Three ###\n");
        assert_eq!(note.headings.len(), 2);
        assert_eq!(note.headings[0].line, 2);
        assert_eq!(note.headings[1].level, 3);
        assert_eq!(note.headings[1].text, "Three");
    }

    #[test]
    fn malformed_frontmatter_is_skipped() {
        let note = parse_note("Note.md", "---\ntags: [broken\n---\n# Real title");
        assert!(note.frontmatter.is_empty());
        assert!(note.tags.is_empty());
        assert_eq!(note.title, "Real title");
    }

    #[test]
    fn ignores_links_tags_and_headings_in_code() {
        let note = parse_note(
            "Note.md",
            "`[[Inline]] #inline`\n```md\n# Fake\n[[Fenced]] #fenced\n```\n# Real\n[[Shown]] #shown",
        );
        assert_eq!(note.links.len(), 1);
        assert_eq!(note.links[0].target_path, "Shown");
        assert_eq!(note.tags, vec!["shown"]);
        assert_eq!(note.headings.len(), 1);
        assert_eq!(note.headings[0].text, "Real");
    }
}
