use std::{fs, path::Path, sync::mpsc, time::Duration};

use notem::{
    commands::{
        files::rename_path,
        links::{backlinks_for_vault, link_unlinked_for_vault, links_graph_for_vault},
        search::search_connection,
    },
    index::{db, watcher::VaultWatcher},
};
use rusqlite::Connection;
use tempfile::TempDir;
use walkdir::WalkDir;

fn fixture_vault() -> TempDir {
    let temp = tempfile::tempdir().expect("create temporary vault");
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/vault");
    for entry in WalkDir::new(&fixture) {
        let entry = entry.expect("walk fixture");
        let relative = entry.path().strip_prefix(&fixture).expect("relative path");
        let destination = temp.path().join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(destination).expect("create fixture directory");
        } else {
            fs::copy(entry.path(), destination).expect("copy fixture file");
        }
    }
    temp
}

fn count(connection: &Connection, table: &str) -> i64 {
    connection
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .expect("count table rows")
}

#[test]
fn fixture_scan_populates_exact_derived_rows() {
    let vault = fixture_vault();
    let first = db::full_scan(vault.path(), |_| {}).expect("scan fixture");
    assert_eq!(first.total_files, 5);
    assert_eq!(first.changed_paths.len(), 5);

    let connection = db::open(vault.path()).expect("open index");
    assert_eq!(count(&connection, "files"), 5);
    assert_eq!(count(&connection, "links"), 11);
    assert_eq!(count(&connection, "tags"), 10);
    assert_eq!(count(&connection, "headings"), 10);
    assert_eq!(count(&connection, "frontmatter"), 9);
    assert_eq!(count(&connection, "fts"), 5);
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*) FROM links WHERE target_id IS NOT NULL",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("count resolved links"),
        10
    );
    drop(connection);

    let second = db::full_scan(vault.path(), |_| {}).expect("rescan unchanged fixture");
    assert!(second.changed_paths.is_empty());
}

#[test]
fn binary_markdown_file_does_not_break_vault_indexing() {
    let vault = fixture_vault();
    fs::write(vault.path().join("binary.md"), [0xff, 0xfe, 0x00, 0x01])
        .expect("write binary markdown file");
    let result = db::full_scan(vault.path(), |_| {}).expect("scan with binary note");
    assert_eq!(result.total_files, 6);
    let connection = db::open(vault.path()).expect("open index");
    let title: String = connection
        .query_row(
            "SELECT title FROM files WHERE path = 'binary.md'",
            [],
            |row| row.get(0),
        )
        .expect("binary note metadata");
    assert_eq!(title, "binary");
}

#[test]
fn schema_version_mismatch_recreates_the_disposable_index() {
    let vault = fixture_vault();
    db::full_scan(vault.path(), |_| {}).expect("scan fixture");
    let connection = db::open(vault.path()).expect("open index");
    connection
        .execute(
            "UPDATE meta SET value = 'outdated' WHERE key = 'schema_version'",
            [],
        )
        .expect("change schema version");
    drop(connection);

    let connection = db::open(vault.path()).expect("reopen outdated index");
    assert_eq!(count(&connection, "files"), 0);
    assert_eq!(
        connection
            .query_row(
                "SELECT value FROM meta WHERE key = 'schema_version'",
                [],
                |row| row.get::<_, String>(0),
            )
            .expect("read schema version"),
        db::SCHEMA_VERSION
    );
}

#[test]
fn rename_rewrites_resolved_inbound_wikilinks_and_reindexes() {
    let vault = fixture_vault();
    let root = vault.path().canonicalize().expect("canonical vault path");
    db::full_scan(&root, |_| {}).expect("scan fixture");

    let renamed = rename_path(&root, "Projects/NoteM.md", "Renamed.md").expect("rename note");
    assert_eq!(renamed, "Projects/Renamed.md");

    for path in ["Daily/2026-07-25.md", "Home.md", "Ideas.md", "Reference.md"] {
        let content = fs::read_to_string(root.join(path)).expect("read referencing note");
        assert!(
            content.contains("[[Projects/Renamed"),
            "{path} did not contain the rewritten link:\n{content}"
        );
        assert!(!content.contains("[[Projects/NoteM"));
    }
    let reference = fs::read_to_string(root.join("Reference.md")).expect("read reference note");
    assert!(reference.contains("[[Projects/Renamed|the app]]"));

    let connection = db::open(&root).expect("open index");
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*) FROM files WHERE path = 'Projects/Renamed.md'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("count renamed file"),
        1
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*) FROM links
                 JOIN files target ON target.id = links.target_id
                 WHERE target.path = 'Projects/Renamed.md'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("count rewritten inbound links"),
        4
    );
}

#[test]
fn external_edit_is_debounced_and_reindexed_by_watcher() {
    let vault = fixture_vault();
    let root = vault.path().canonicalize().expect("canonical vault path");
    db::full_scan(&root, |_| {}).expect("scan fixture");
    let (sender, receiver) = mpsc::channel();
    let _watcher = VaultWatcher::start(
        root.clone(),
        move |paths| {
            let _ = sender.send(paths);
        },
        || {},
    )
    .expect("start watcher");

    let home = root.join("Home.md");
    let mut content = fs::read_to_string(&home).expect("read Home");
    content.push_str("\nWatcher update #external\n");
    fs::write(&home, content).expect("edit Home externally");

    let paths = receiver
        .recv_timeout(Duration::from_secs(10))
        .expect("receive debounced watcher update");
    assert!(paths.contains(&"Home.md".to_owned()));

    let connection = db::open(&root).expect("open index");
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*) FROM tags
                 JOIN files ON files.id = tags.file_id
                 WHERE files.path = 'Home.md' AND tags.tag = 'external'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("count externally indexed tag"),
        1
    );
}

#[test]
fn external_pdf_edit_is_reported_without_indexing_content() {
    let vault = fixture_vault();
    let root = vault.path().canonicalize().expect("canonical vault path");
    db::full_scan(&root, |_| {}).expect("scan fixture");
    let pdf = root.join("Reference.pdf");
    fs::write(&pdf, b"%PDF-1.4\nfirst").expect("create pdf");
    let (sender, receiver) = mpsc::channel();
    let _watcher = VaultWatcher::start(
        root.clone(),
        move |paths| {
            let _ = sender.send(paths);
        },
        || {},
    )
    .expect("start watcher");

    fs::write(&pdf, b"%PDF-1.4\nsecond").expect("edit pdf externally");
    let paths = receiver
        .recv_timeout(Duration::from_secs(10))
        .expect("receive PDF watcher update");
    assert!(paths.contains(&"Reference.pdf".to_owned()));

    let connection = db::open(&root).expect("open index");
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*) FROM files WHERE path = 'Reference.pdf'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("count PDF index rows"),
        0
    );
}

#[test]
fn full_text_search_supports_phrases_tag_and_path_filters() {
    let vault = fixture_vault();
    db::full_scan(vault.path(), |_| {}).expect("scan fixture");
    let connection = db::open(vault.path()).expect("open index");

    let phrase =
        search_connection(&connection, r#""Fast search""#, 20).expect("search exact phrase");
    assert_eq!(phrase.len(), 1);
    assert_eq!(phrase[0].path, "Projects/NoteM.md");
    assert_eq!(phrase[0].line, 12);
    assert!(phrase[0].snippet.contains('\u{e000}'));

    let filtered = search_connection(&connection, "tag:#rust path:Projects", 20)
        .expect("search metadata filters");
    assert_eq!(filtered.len(), 1);
    assert_eq!(filtered[0].path, "Projects/NoteM.md");

    let path_only =
        search_connection(&connection, "path:Daily", 20).expect("search path-only filter");
    assert_eq!(path_only.len(), 1);
    assert_eq!(path_only[0].path, "Daily/2026-07-25.md");
}

#[test]
fn backlinks_separate_linked_and_unlinked_title_mentions() {
    let vault = fixture_vault();
    fs::write(
        vault.path().join("Unlinked.md"),
        "# Unlinked\n\nNoteM deserves an unlinked mention.\n",
    )
    .expect("write unlinked mention");
    db::full_scan(vault.path(), |_| {}).expect("scan fixture");

    let backlinks = backlinks_for_vault(vault.path(), "Projects/NoteM.md").expect("load backlinks");
    assert_eq!(backlinks.linked.len(), 4);
    assert_eq!(backlinks.unlinked.len(), 1);
    assert_eq!(backlinks.unlinked[0].path, "Unlinked.md");
    assert_eq!(backlinks.unlinked[0].line, 3);
    assert_eq!(backlinks.unlinked[0].text, "NoteM");

    let mention = &backlinks.unlinked[0];
    link_unlinked_for_vault(
        vault.path(),
        &mention.path,
        mention.start,
        mention.end,
        &mention.text,
    )
    .expect("link unlinked mention");
    let updated = fs::read_to_string(vault.path().join("Unlinked.md")).expect("read linked note");
    assert!(updated.contains("[[NoteM]] deserves"));
    let refreshed =
        backlinks_for_vault(vault.path(), "Projects/NoteM.md").expect("reload backlinks");
    assert_eq!(refreshed.linked.len(), 5);
    assert!(refreshed.unlinked.is_empty());
}

#[test]
fn graph_contains_resolved_isolated_and_ghost_nodes() {
    let vault = fixture_vault();
    fs::write(vault.path().join("Isolated.md"), "# Alone\n").expect("write isolated note");
    db::full_scan(vault.path(), |_| {}).expect("scan fixture");

    let graph = links_graph_for_vault(vault.path()).expect("load graph");
    assert_eq!(graph.nodes.len(), 7);
    assert!(graph
        .nodes
        .iter()
        .any(|node| node.id == "Isolated" && node.title == "Alone" && node.links_count == 0));
    let ghost = graph
        .nodes
        .iter()
        .find(|node| node.id == "Missing Note")
        .expect("unresolved target is represented");
    assert!(ghost.ghost);
    assert_eq!(ghost.links_count, 1);
    assert!(graph
        .edges
        .iter()
        .any(|edge| edge.source == "Ideas" && edge.target == "Missing Note"));
    assert_eq!(
        graph
            .edges
            .iter()
            .filter(|edge| edge.source == "Home" && edge.target == "Projects/NoteM")
            .count(),
        1
    );
}
