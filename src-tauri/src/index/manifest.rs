use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::storage::write_atomic;
use crate::error::WorkspaceError;

pub const MANIFEST_VERSION: u32 = 1;
pub const MANIFEST_FILE: &str = "manifest.json";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub entries: BTreeMap<String, u64>,
}

impl Manifest {
    pub fn paths_under<'a>(&'a self, prefix: &'a str) -> impl Iterator<Item = &'a String> {
        self.entries
            .keys()
            .filter(move |path| is_under(path, prefix))
    }

    pub fn remove_prefix(&mut self, prefix: &str) {
        self.entries.retain(|path, _| !is_under(path, prefix));
    }
}

pub fn is_under(path: &str, prefix: &str) -> bool {
    path == prefix || path.starts_with(&format!("{prefix}/"))
}

pub fn load_manifest(dir: &Path) -> Manifest {
    let Ok(text) = fs::read_to_string(dir.join(MANIFEST_FILE)) else {
        return Manifest::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn save_manifest(dir: &Path, manifest: &Manifest) -> Result<(), WorkspaceError> {
    let mut manifest = manifest.clone();
    manifest.version = MANIFEST_VERSION;
    let bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| WorkspaceError::Io(error.to_string()))?;
    write_atomic(&dir.join(MANIFEST_FILE), &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn manifest_round_trips() {
        let temp = tempdir().unwrap();
        let mut manifest = Manifest::default();
        manifest.version = MANIFEST_VERSION;
        manifest.entries.insert("/w/a.md".into(), 100);
        save_manifest(temp.path(), &manifest).unwrap();
        assert_eq!(load_manifest(temp.path()), manifest);
    }

    #[test]
    fn corrupt_manifest_falls_back_to_empty() {
        let temp = tempdir().unwrap();
        std::fs::write(temp.path().join("manifest.json"), "{not json").unwrap();
        assert_eq!(load_manifest(temp.path()), Manifest::default());
    }

    #[test]
    fn prefix_helpers_cover_subtrees() {
        let mut manifest = Manifest::default();
        manifest.entries.insert("/w/dir/a.md".into(), 1);
        manifest.entries.insert("/w/dir/sub/b.md".into(), 2);
        manifest.entries.insert("/w/other.md".into(), 3);

        assert_eq!(manifest.paths_under("/w/dir").count(), 2);
        manifest.remove_prefix("/w/dir");
        assert_eq!(manifest.entries.len(), 1);
    }
}
