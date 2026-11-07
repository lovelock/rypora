use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, UNIX_EPOCH};

use parking_lot::Mutex;
use serde::Serialize;
use tantivy::schema::TantivyDocument;
use tantivy::{Index, IndexReader, IndexWriter, Term};
use walkdir::WalkDir;

use super::manifest::{save_manifest, Manifest};
use super::schema::IndexSchema;
use crate::error::WorkspaceError;
use crate::tree::{is_markdown, is_skipped_dir};
use crate::workspace::read_file;

const BATCH_SIZE: usize = 64;
const DEBOUNCE: Duration = Duration::from_millis(300);

#[derive(Debug, Clone)]
pub enum IndexCommand {
    RefreshPath(PathBuf),
    DeletePrefix(PathBuf),
    RenamePrefix(PathBuf, PathBuf),
    Rebuild,
    Reconcile,
    Shutdown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub phase: String,
    pub indexed: usize,
    pub total: usize,
    pub generation: u64,
    pub available: bool,
}

impl IndexStatus {
    pub fn new(generation: u64) -> Self {
        Self {
            phase: "idle".to_string(),
            indexed: 0,
            total: 0,
            generation,
            available: true,
        }
    }
}

pub type StatusCallback = Arc<dyn Fn(IndexStatus) + Send + Sync>;

pub struct WorkerHandle {
    pub sender: Sender<IndexCommand>,
    join: Option<JoinHandle<()>>,
}

impl WorkerHandle {
    pub fn shutdown(mut self) {
        let _ = self.sender.send(IndexCommand::Shutdown);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

impl Drop for WorkerHandle {
    fn drop(&mut self) {
        let _ = self.sender.send(IndexCommand::Shutdown);
    }
}

pub struct WorkerConfig {
    pub root: PathBuf,
    pub index_dir: PathBuf,
    pub index: Index,
    pub schema: IndexSchema,
    pub manifest: Manifest,
    pub reader: IndexReader,
    pub status: Arc<Mutex<IndexStatus>>,
    pub on_status: StatusCallback,
    pub generation: u64,
}

pub fn spawn_worker(config: WorkerConfig) -> Result<WorkerHandle, WorkspaceError> {
    let writer = config
        .index
        .writer::<TantivyDocument>(50_000_000)
        .map_err(|error| WorkspaceError::Io(error.to_string()))?;

    let (sender, receiver) = mpsc::channel();
    let join = thread::spawn(move || run(config, writer, receiver));

    Ok(WorkerHandle {
        sender,
        join: Some(join),
    })
}

fn run(config: WorkerConfig, mut writer: IndexWriter<TantivyDocument>, receiver: Receiver<IndexCommand>) {
    let mut pending: BTreeSet<PathBuf> = BTreeSet::new();
    let mut manifest = config.manifest.clone();
    let mut dirty = false;
    let mut bulk = false;
    let mut shutdown = false;

    loop {
        match receiver.recv_timeout(DEBOUNCE) {
            Ok(command) => apply(
                command,
                &config,
                &mut writer,
                &mut manifest,
                &mut pending,
                &mut dirty,
                &mut bulk,
                &mut shutdown,
            ),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                shutdown = true;
            }
        }

        if !shutdown {
            while let Ok(command) = receiver.try_recv() {
                apply(
                    command,
                    &config,
                    &mut writer,
                    &mut manifest,
                    &mut pending,
                    &mut dirty,
                    &mut bulk,
                    &mut shutdown,
                );
                if shutdown {
                    break;
                }
            }
        }

        if !pending.is_empty() || dirty {
            flush(
                &config,
                &mut writer,
                &mut manifest,
                &mut pending,
                bulk,
            );
            dirty = false;
            bulk = false;
        }

        if shutdown {
            let _ = writer.commit();
            let _ = save_manifest(&config.index_dir, &manifest);
            set_status(&config, "idle", 0, 0);
            break;
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn apply(
    command: IndexCommand,
    config: &WorkerConfig,
    writer: &mut IndexWriter<TantivyDocument>,
    manifest: &mut Manifest,
    pending: &mut BTreeSet<PathBuf>,
    dirty: &mut bool,
    bulk: &mut bool,
    shutdown: &mut bool,
) {
    match command {
        IndexCommand::RefreshPath(path) => {
            if path.is_dir() {
                collect_markdown(&path, pending);
            } else {
                pending.insert(path);
            }
        }
        IndexCommand::DeletePrefix(prefix) => {
            let prefix_text = prefix.to_string_lossy().to_string();
            for path in manifest.paths_under(&prefix_text).cloned().collect::<Vec<_>>() {
                writer.delete_term(Term::from_field_text(config.schema.path, &path));
            }
            manifest.remove_prefix(&prefix_text);
            *dirty = true;
        }
        IndexCommand::RenamePrefix(old, new) => {
            let old_text = old.to_string_lossy().to_string();
            let new_text = new.to_string_lossy().to_string();
            for path in manifest.paths_under(&old_text).cloned().collect::<Vec<_>>() {
                writer.delete_term(Term::from_field_text(config.schema.path, &path));
                let renamed = format!("{new_text}{}", &path[old_text.len()..]);
                manifest.entries.remove(&path);
                pending.insert(PathBuf::from(renamed));
            }
            *dirty = true;
            *bulk = true;
        }
        IndexCommand::Rebuild => {
            let _ = writer.delete_all_documents();
            manifest.entries.clear();
            pending.clear();
            collect_markdown(&config.root, pending);
            *bulk = true;
            let total = pending.len();
            set_status(config, "indexing", 0, total);
        }
        IndexCommand::Reconcile => {
            reconcile(config, manifest, pending, writer, dirty);
            *bulk = true;
        }
        IndexCommand::Shutdown => {
            *shutdown = true;
        }
    }
}

fn reconcile(
    config: &WorkerConfig,
    manifest: &mut Manifest,
    pending: &mut BTreeSet<PathBuf>,
    writer: &IndexWriter<TantivyDocument>,
    dirty: &mut bool,
) {
    let mut disk: HashMap<String, u64> = HashMap::new();
    for path in markdown_files(&config.root) {
        let key = path.to_string_lossy().to_string();
        disk.insert(key, mtime_ms(&path));
    }

    for (path, mtime) in &disk {
        if manifest.entries.get(path) != Some(mtime) {
            pending.insert(PathBuf::from(path));
        }
    }

    for path in manifest.entries.keys().cloned().collect::<Vec<_>>() {
        if !disk.contains_key(&path) {
            writer.delete_term(Term::from_field_text(config.schema.path, &path));
            manifest.entries.remove(&path);
            *dirty = true;
        }
    }

    set_status(config, "reconciling", 0, pending.len());
}

fn flush(
    config: &WorkerConfig,
    writer: &mut IndexWriter<TantivyDocument>,
    manifest: &mut Manifest,
    pending: &mut BTreeSet<PathBuf>,
    bulk: bool,
) {
    let total = pending.len();
    let mut processed = 0usize;

    while !pending.is_empty() {
        let mut count = 0usize;
        while count < BATCH_SIZE {
            let Some(path) = pending.pop_first() else {
                break;
            };
            index_path(config, writer, manifest, &path);
            count += 1;
            processed += 1;
        }

        if writer.commit().is_err() {
            set_status(config, "unavailable", processed, total);
            return;
        }
        let _ = config.reader.reload();
        let _ = save_manifest(&config.index_dir, manifest);
        set_status(
            config,
            if pending.is_empty() { "idle" } else { "indexing" },
            processed,
            total,
        );
    }

    if total == 0 {
        let _ = writer.commit();
        let _ = config.reader.reload();
        let _ = save_manifest(&config.index_dir, manifest);
        set_status(config, "idle", 0, 0);
    } else if !bulk {
        set_status(config, "idle", total, total);
    }
}

fn index_path(
    config: &WorkerConfig,
    writer: &mut IndexWriter<TantivyDocument>,
    manifest: &mut Manifest,
    path: &Path,
) {
    let path_text = path.to_string_lossy().to_string();

    if !path.is_file() || !is_markdown(path) {
        writer.delete_term(Term::from_field_text(config.schema.path, &path_text));
        manifest.entries.remove(&path_text);
        return;
    }

    let content = match read_file(path) {
        Ok(content) => content,
        Err(_) => {
            writer.delete_term(Term::from_field_text(config.schema.path, &path_text));
            manifest.entries.remove(&path_text);
            return;
        }
    };

    let rel_path = path
        .strip_prefix(&config.root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    let title = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let mut document = TantivyDocument::default();
    document.add_text(config.schema.path, &path_text);
    document.add_text(config.schema.rel_path, rel_path);
    document.add_text(config.schema.title, title);
    document.add_text(config.schema.body, &content.text);
    document.add_u64(config.schema.mtime, content.mtime_ms);

    writer.delete_term(Term::from_field_text(config.schema.path, &path_text));
    if writer.add_document(document).is_ok() {
        manifest.entries.insert(path_text, content.mtime_ms);
    }
}

fn collect_markdown(dir: &Path, out: &mut BTreeSet<PathBuf>) {
    for path in markdown_files(dir) {
        out.insert(path);
    }
}

fn markdown_files(root: &Path) -> Vec<PathBuf> {
    WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            if !entry.file_type().is_dir() {
                return true;
            }
            !is_skipped_dir(&entry.file_name().to_string_lossy())
        })
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file() && is_markdown(entry.path()))
        .map(|entry| entry.into_path())
        .collect()
}

fn mtime_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn set_status(config: &WorkerConfig, phase: &str, indexed: usize, total: usize) {
    let snapshot = {
        let mut status = config.status.lock();
        status.phase = phase.to_string();
        status.indexed = indexed;
        status.total = total;
        status.generation = config.generation;
        status.available = true;
        status.clone()
    };
    (config.on_status)(snapshot);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::manifest::load_manifest;
    use crate::index::schema::build_schema;
    use crate::index::storage::open_or_create;
    use std::fs;
    use tempfile::tempdir;

    fn wait_until(mut check: impl FnMut() -> bool) {
        for _ in 0..100 {
            if check() {
                return;
            }
            thread::sleep(Duration::from_millis(50));
        }
        panic!("condition was not met");
    }

    fn setup(dir: &Path) -> (Index, IndexReader, IndexSchema, Arc<Mutex<IndexStatus>>, WorkerHandle, PathBuf) {
        let schema = build_schema();
        let index = open_or_create(dir, &schema).unwrap();
        let reader = index.reader().unwrap();
        let status = Arc::new(Mutex::new(IndexStatus::new(1)));
        let root = dir.join("notes");
        fs::create_dir_all(&root).unwrap();
        let handle = spawn_worker(WorkerConfig {
            root: root.clone(),
            index_dir: dir.to_path_buf(),
            index: index.clone(),
            schema: schema.clone(),
            manifest: Manifest::default(),
            reader: reader.clone(),
            status: status.clone(),
            on_status: Arc::new(|_| {}),
            generation: 1,
        })
        .unwrap();
        (index, reader, schema, status, handle, root)
    }

    #[test]
    fn indexes_files_and_commits() {
        let temp = tempdir().unwrap();
        let (index, reader, _schema, _status, handle, root) = setup(temp.path());
        let file = root.join("a.md");
        fs::write(&file, "# 我的笔记本\n\n正文内容").unwrap();

        handle.sender.send(IndexCommand::RefreshPath(file)).unwrap();
        wait_until(|| reader.searcher().num_docs() == 1);

        let _ = index;
        assert_eq!(load_manifest(temp.path()).entries.len(), 1);
    }

    #[test]
    fn deletes_a_directory_prefix() {
        let temp = tempdir().unwrap();
        let (_index, reader, _schema, _status, handle, root) = setup(temp.path());
        let dir = root.join("sub");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.md"), "a").unwrap();
        fs::write(dir.join("b.md"), "b").unwrap();

        handle.sender.send(IndexCommand::RefreshPath(dir.clone())).unwrap();
        wait_until(|| reader.searcher().num_docs() == 2);

        handle.sender.send(IndexCommand::DeletePrefix(dir)).unwrap();
        wait_until(|| reader.searcher().num_docs() == 0);
    }

    #[test]
    fn renames_a_directory_prefix() {
        let temp = tempdir().unwrap();
        let (_index, reader, _schema, _status, handle, root) = setup(temp.path());
        let old = root.join("old");
        let new = root.join("new");
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("a.md"), "a").unwrap();

        handle.sender.send(IndexCommand::RefreshPath(old.clone())).unwrap();
        wait_until(|| reader.searcher().num_docs() == 1);
        fs::rename(&old, &new).unwrap();

        handle
            .sender
            .send(IndexCommand::RenamePrefix(old, new.clone()))
            .unwrap();
        wait_until(|| {
            load_manifest(temp.path())
                .entries
                .keys()
                .any(|path| path.contains("/new/a.md"))
        });

        let manifest = load_manifest(temp.path());
        assert!(manifest.entries.keys().any(|path| path.contains("/new/a.md")));
        assert!(!manifest.entries.keys().any(|path| path.contains("/old/a.md")));
    }
}
