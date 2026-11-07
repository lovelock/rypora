use std::path::{Path, PathBuf};
use std::sync::Arc;

use parking_lot::Mutex;
use tantivy::{Index, IndexReader};

use super::manifest::{load_manifest, save_manifest, Manifest};
use super::query::{self, TextHit};
use super::schema::{build_schema, IndexSchema};
use super::storage::{index_dir, needs_rebuild, open_or_create, save_meta, Meta};
use super::worker::{
    spawn_worker, IndexCommand, IndexStatus, StatusCallback, WorkerConfig, WorkerHandle,
};
use crate::error::WorkspaceError;

#[derive(Clone)]
pub struct IndexService {
    inner: Arc<Inner>,
}

struct Inner {
    root: PathBuf,
    index_dir: PathBuf,
    index: Index,
    schema: IndexSchema,
    reader: IndexReader,
    status: Arc<Mutex<IndexStatus>>,
    handle: Mutex<Option<WorkerHandle>>,
}

impl IndexService {
    pub fn open_at(
        app_data: &Path,
        root: &Path,
        generation: u64,
        on_status: StatusCallback,
    ) -> Result<Self, WorkspaceError> {
        let dir = index_dir(app_data, root);
        let rebuild = needs_rebuild(&dir, root);
        if rebuild {
            let _ = std::fs::remove_dir_all(&dir);
        }
        std::fs::create_dir_all(&dir)?;

        let schema = build_schema();
        let index = open_or_create(&dir, &schema)?;
        let reader = index
            .reader()
            .map_err(|error| WorkspaceError::Io(error.to_string()))?;

        let manifest = if rebuild {
            Manifest::default()
        } else {
            load_manifest(&dir)
        };
        let manifest_empty = manifest.entries.is_empty();

        save_meta(
            &dir,
            &Meta {
                schema_version: super::schema::SCHEMA_VERSION,
                tokenizer_version: super::schema::TOKENIZER_VERSION,
                root: root.to_string_lossy().to_string(),
            },
        )?;

        let status = Arc::new(Mutex::new(IndexStatus::new(generation)));
        let handle = spawn_worker(WorkerConfig {
            root: root.to_path_buf(),
            index_dir: dir.clone(),
            index: index.clone(),
            schema: schema.clone(),
            manifest,
            reader: reader.clone(),
            status: status.clone(),
            on_status,
            generation,
        })?;

        let initial = if rebuild || manifest_empty {
            IndexCommand::Rebuild
        } else {
            IndexCommand::Reconcile
        };
        let _ = handle.sender.send(initial);

        Ok(Self {
            inner: Arc::new(Inner {
                root: root.to_path_buf(),
                index_dir: dir,
                index,
                schema,
                reader,
                status,
                handle: Mutex::new(Some(handle)),
            }),
        })
    }

    pub fn root(&self) -> &Path {
        &self.inner.root
    }

    pub fn index_dir(&self) -> &Path {
        &self.inner.index_dir
    }

    pub fn enqueue(&self, command: IndexCommand) {
        if let Some(handle) = self.inner.handle.lock().as_ref() {
            let _ = handle.sender.send(command);
        }
    }

    pub fn status(&self) -> IndexStatus {
        self.inner.status.lock().clone()
    }

    pub fn search(
        &self,
        raw_query: &str,
        exclude: &[String],
        limit: usize,
    ) -> Result<Vec<TextHit>, WorkspaceError> {
        query::search(
            &self.inner.index,
            &self.inner.reader,
            &self.inner.schema,
            raw_query,
            exclude,
            limit,
        )
    }

    pub fn rebuild(&self) {
        self.enqueue(IndexCommand::Rebuild);
    }

    pub fn shutdown(&self) {
        if let Some(handle) = self.inner.handle.lock().take() {
            handle.shutdown();
        }
    }

    pub fn save_manifest(&self, manifest: &Manifest) -> Result<(), WorkspaceError> {
        save_manifest(&self.inner.index_dir, manifest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::thread;
    use std::time::Duration;
    use tempfile::tempdir;

    fn wait_until(mut check: impl FnMut() -> bool) {
        for _ in 0..120 {
            if check() {
                return;
            }
            thread::sleep(Duration::from_millis(50));
        }
        panic!("index condition was not met");
    }

    #[test]
    fn opens_indexes_and_searches() {
        let temp = tempdir().unwrap();
        let app_data = temp.path().join("app");
        let root = temp.path().join("notes");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("a.md"), "我的笔记本很好用").unwrap();

        let service = IndexService::open_at(
            &app_data,
            &root,
            1,
            Arc::new(|_| {}),
        )
        .unwrap();

        wait_until(|| {
            service
                .search("笔记", &[], 10)
                .map(|hits| !hits.is_empty())
                .unwrap_or(false)
        });

        let hits = service.search("笔记", &[], 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].path.ends_with("a.md"));

        service.rebuild();
        wait_until(|| {
            service
                .search("笔记", &[], 10)
                .map(|hits| !hits.is_empty())
                .unwrap_or(false)
        });

        service.shutdown();
    }
}
