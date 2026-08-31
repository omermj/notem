//! Debounced vault filesystem watching.

use std::{
    collections::HashSet,
    path::{Component, Path, PathBuf},
    sync::mpsc::{self, RecvTimeoutError, Sender},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use notify::{recommended_watcher, Event, RecommendedWatcher, RecursiveMode, Watcher};

use crate::{
    error::AppError,
    index::db::{full_scan, relative_path, sync_paths},
    vault_path::root_is_available,
};

const DEBOUNCE: Duration = Duration::from_millis(300);

pub struct VaultWatcher {
    watcher: Option<RecommendedWatcher>,
    stop: Sender<()>,
    worker: Option<JoinHandle<()>>,
}

impl VaultWatcher {
    pub fn start<F, G>(vault: PathBuf, on_update: F, on_unavailable: G) -> Result<Self, AppError>
    where
        F: Fn(Vec<String>) + Send + 'static,
        G: Fn() + Send + 'static,
    {
        let (event_sender, event_receiver) = mpsc::channel();
        let (stop_sender, stop_receiver) = mpsc::channel();
        let mut watcher = recommended_watcher(event_sender)
            .map_err(|error| AppError::Message(error.to_string()))?;
        watcher
            .watch(&vault, RecursiveMode::Recursive)
            .map_err(|error| AppError::Message(error.to_string()))?;

        let worker = thread::spawn(move || loop {
            if !root_is_available(&vault) {
                on_unavailable();
                break;
            }
            if stop_receiver.try_recv().is_ok() {
                break;
            }
            let first = match event_receiver.recv_timeout(Duration::from_millis(100)) {
                Ok(Ok(event)) if !is_index_relevant_event(&event) => continue,
                Ok(Ok(event)) => event,
                Ok(Err(_)) => continue,
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => break,
            };
            let mut events = vec![first];
            let mut deadline = Instant::now() + DEBOUNCE;
            loop {
                if stop_receiver.try_recv().is_ok() {
                    return;
                }
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    break;
                }
                match event_receiver.recv_timeout(remaining) {
                    Ok(Ok(event)) if !is_index_relevant_event(&event) => {}
                    Ok(Ok(event)) => {
                        events.push(event);
                        deadline = Instant::now() + DEBOUNCE;
                    }
                    Ok(Err(_)) => {}
                    Err(RecvTimeoutError::Timeout | RecvTimeoutError::Disconnected) => break,
                }
            }

            match process_events(&vault, events) {
                Ok(paths) if !paths.is_empty() => on_update(paths),
                Ok(_) => {}
                Err(_) if !root_is_available(&vault) => {
                    on_unavailable();
                    break;
                }
                Err(_) => {}
            }
        });

        Ok(Self {
            watcher: Some(watcher),
            stop: stop_sender,
            worker: Some(worker),
        })
    }
}

impl Drop for VaultWatcher {
    fn drop(&mut self) {
        let _ = self.stop.send(());
        self.watcher.take();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn is_index_relevant_event(event: &Event) -> bool {
    // `notify`'s Linux backend reports IN_OPEN and both close variants as
    // access events. Reading the vault (including our own tree refresh) must
    // not be mistaken for an external edit or it creates an index/update
    // feedback loop.
    !event.kind.is_access()
}

fn process_events(vault: &Path, events: Vec<Event>) -> Result<Vec<String>, AppError> {
    let mut markdown_paths = HashSet::new();
    let mut changed_paths = HashSet::new();
    let mut needs_full_scan = false;
    for event in events {
        if !is_index_relevant_event(&event) {
            continue;
        }
        for path in event.paths {
            if is_notem_path(vault, &path) {
                continue;
            }
            let Ok(relative) = relative_path(vault, &path) else {
                continue;
            };
            changed_paths.insert(relative.clone());
            if Path::new(&relative)
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
            {
                markdown_paths.insert(relative);
            } else if path.is_dir() || Path::new(&relative).extension().is_none() {
                needs_full_scan = true;
            }
        }
    }

    let indexed_changes = if needs_full_scan {
        full_scan(vault, |_| {})?.changed_paths
    } else {
        let mut paths: Vec<String> = markdown_paths.into_iter().collect();
        paths.sort();
        sync_paths(vault, &paths)?.changed_paths
    };
    changed_paths.extend(indexed_changes);
    let mut result: Vec<String> = changed_paths.into_iter().collect();
    result.sort();
    Ok(result)
}

fn is_notem_path(vault: &Path, path: &Path) -> bool {
    path.strip_prefix(vault).is_ok_and(|relative| {
        relative
            .components()
            .next()
            .is_some_and(|component| component == Component::Normal(".notem".as_ref()))
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use notify::{
        event::{AccessKind, AccessMode},
        EventKind,
    };
    use tempfile::tempdir;

    use super::{is_index_relevant_event, process_events, Event};

    #[test]
    fn ignores_linux_read_access_events() {
        let vault = tempdir().expect("temporary vault");
        let note = vault.path().join("Note.md");
        fs::write(&note, "# Note").expect("fixture note");
        let events = [
            Event::new(EventKind::Access(AccessKind::Open(AccessMode::Read)))
                .add_path(note.clone()),
            Event::new(EventKind::Access(AccessKind::Close(AccessMode::Read)))
                .add_path(note),
            Event::new(EventKind::Access(AccessKind::Open(AccessMode::Read)))
                .add_path(vault.path().to_path_buf()),
        ];

        assert!(events.iter().all(|event| !is_index_relevant_event(event)));
        assert_eq!(
            process_events(vault.path(), events.into()).expect("process access events"),
            Vec::<String>::new()
        );
    }
}
