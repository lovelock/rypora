use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::WorkspaceError;

pub const SELF_WRITE_WINDOW: Duration = Duration::from_secs(1);

pub type DebouncerHandle = Debouncer<RecommendedWatcher, RecommendedCache>;
pub type SelfWrites = Arc<Mutex<HashMap<PathBuf, Instant>>>;

#[derive(Debug, Clone, Serialize)]
pub struct FsChanged {
    pub paths: Vec<String>,
}

pub fn should_suppress(map: &mut HashMap<PathBuf, Instant>, path: &Path, now: Instant) -> bool {
    match map.get(path).copied() {
        Some(stamp) if now.duration_since(stamp) < SELF_WRITE_WINDOW => true,
        Some(_) => {
            map.remove(path);
            false
        }
        None => false,
    }
}

pub fn mark_self_write(map: &SelfWrites, path: &Path) {
    let mut guard = map.lock();
    let now = Instant::now();
    guard.retain(|_, stamp| now.duration_since(*stamp) < SELF_WRITE_WINDOW * 4);
    guard.insert(path.to_path_buf(), now);
}

pub fn start(
    app: &AppHandle,
    root: &Path,
    debouncer: &Mutex<Option<DebouncerHandle>>,
    self_writes: SelfWrites,
) -> Result<(), WorkspaceError> {
    if let Some(previous) = debouncer.lock().take() {
        previous.stop_nonblocking();
    }

    let app = app.clone();
    let mut watcher = new_debouncer(
        Duration::from_millis(250),
        None,
        move |result: DebounceEventResult| {
            let Ok(events) = result else {
                return;
            };

            let mut paths: Vec<String> = Vec::new();
            {
                let mut guard = self_writes.lock();
                let now = Instant::now();
                for debounced in events {
                    for path in debounced.event.paths {
                        if should_suppress(&mut guard, &path, now) {
                            continue;
                        }
                        let text = path.to_string_lossy().to_string();
                        if !paths.contains(&text) {
                            paths.push(text);
                        }
                    }
                }
            }

            if !paths.is_empty() {
                let _ = app.emit("fs://changed", FsChanged { paths });
            }
        },
    )
    .map_err(|error| WorkspaceError::Io(error.to_string()))?;

    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(|error| WorkspaceError::Io(error.to_string()))?;

    *debouncer.lock() = Some(watcher);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suppresses_recent_self_writes() {
        let mut map = HashMap::new();
        let now = Instant::now();
        map.insert(PathBuf::from("/a.md"), now);

        assert!(should_suppress(
            &mut map,
            Path::new("/a.md"),
            now + Duration::from_millis(100)
        ));
    }

    #[test]
    fn expires_after_window() {
        let mut map = HashMap::new();
        let now = Instant::now();
        map.insert(PathBuf::from("/a.md"), now);

        assert!(!should_suppress(
            &mut map,
            Path::new("/a.md"),
            now + Duration::from_secs(2)
        ));
        assert!(map.is_empty());
    }

    #[test]
    fn ignores_unknown_paths() {
        let mut map = HashMap::new();
        assert!(!should_suppress(&mut map, Path::new("/b.md"), Instant::now()));
    }
}
