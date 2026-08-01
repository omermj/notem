use std::{fs, time::Instant};

use notem::{commands::search::search_connection, index::db};

#[test]
#[ignore = "release-mode performance audit; run explicitly in CI"]
fn five_thousand_note_vault_meets_index_and_search_targets() {
    let temporary = tempfile::tempdir().expect("temporary vault");
    for index in 0..5_000 {
        fs::write(
            temporary.path().join(format!("note-{index:04}.md")),
            format!("# Note {index}\n\nperformance audit searchable body {index}\n"),
        )
        .expect("fixture note");
    }

    let index_started = Instant::now();
    let result = db::full_scan(temporary.path(), |_| {}).expect("index scan");
    let index_elapsed = index_started.elapsed();
    assert_eq!(result.total_files, 5_000);
    assert!(
        index_elapsed.as_secs_f64() < 3.0,
        "5k index took {index_elapsed:?}, target is <3s"
    );

    let connection = db::open(temporary.path()).expect("index connection");
    let search_started = Instant::now();
    let matches = search_connection(&connection, "\"performance audit\"", 100).expect("FTS search");
    let search_elapsed = search_started.elapsed();
    assert!(!matches.is_empty());
    assert!(
        search_elapsed.as_millis() < 100,
        "search took {search_elapsed:?}, target is <100ms"
    );

    eprintln!(
        "PERF 5k index={:.1}ms search={:.1}ms",
        index_elapsed.as_secs_f64() * 1_000.0,
        search_elapsed.as_secs_f64() * 1_000.0
    );
}
