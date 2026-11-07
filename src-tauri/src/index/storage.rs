use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tantivy::Index;

use super::schema::{
    register_tokenizers, IndexSchema, SCHEMA_VERSION, TOKENIZER_VERSION,
};
use crate::error::WorkspaceError;

pub const META_FILE: &str = "rypora-meta.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub schema_version: u32,
    pub tokenizer_version: u32,
    pub root: String,
}

pub fn hash_path(path: &str) -> String {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    for byte in path.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

pub fn index_dir(app_data: &Path, root: &Path) -> PathBuf {
    app_data
        .join("index")
        .join(hash_path(&root.to_string_lossy()))
}

pub fn load_meta(dir: &Path) -> Option<Meta> {
    let text = fs::read_to_string(dir.join(META_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn save_meta(dir: &Path, meta: &Meta) -> Result<(), WorkspaceError> {
    let bytes = serde_json::to_vec_pretty(meta)
        .map_err(|error| WorkspaceError::Io(error.to_string()))?;
    write_atomic(&dir.join(META_FILE), &bytes)
}

pub fn needs_rebuild(dir: &Path, root: &Path) -> bool {
    match load_meta(dir) {
        Some(meta) => {
            meta.schema_version != SCHEMA_VERSION
                || meta.tokenizer_version != TOKENIZER_VERSION
                || meta.root != root.to_string_lossy().as_ref()
        }
        None => true,
    }
}

pub fn open_or_create(dir: &Path, schema: &IndexSchema) -> Result<Index, WorkspaceError> {
    fs::create_dir_all(dir)?;
    let index = match Index::open_in_dir(dir) {
        Ok(index) => index,
        Err(_) => Index::create_in_dir(dir, schema.schema.clone())
            .map_err(|error| WorkspaceError::Io(error.to_string()))?,
    };
    register_tokenizers(&index);
    Ok(index)
}

pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), WorkspaceError> {
    let parent = path
        .parent()
        .ok_or_else(|| WorkspaceError::Io(path.display().to_string()))?;
    fs::create_dir_all(parent)?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    temp.persist(path)
        .map_err(|error| WorkspaceError::Io(error.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::schema::build_schema;
    use tempfile::tempdir;

    #[test]
    fn hashes_are_stable_and_distinct() {
        assert_eq!(hash_path("/w/notes"), hash_path("/w/notes"));
        assert_ne!(hash_path("/w/notes"), hash_path("/w/other"));
    }

    #[test]
    fn index_dir_is_below_app_data() {
        let dir = index_dir(Path::new("/data"), Path::new("/w/notes"));
        assert!(dir.starts_with("/data/index"));
    }

    #[test]
    fn opens_and_reopens_an_index() {
        let temp = tempdir().unwrap();
        let schema = build_schema();
        let first = open_or_create(temp.path(), &schema).unwrap();
        assert!(first.reader().is_ok());
        drop(first);

        let second = open_or_create(temp.path(), &schema).unwrap();
        assert!(second.reader().is_ok());
    }

    #[test]
    fn meta_round_trips_and_detects_rebuild() {
        let temp = tempdir().unwrap();
        let meta = Meta {
            schema_version: SCHEMA_VERSION,
            tokenizer_version: TOKENIZER_VERSION,
            root: "/w/notes".into(),
        };
        save_meta(temp.path(), &meta).unwrap();
        assert_eq!(load_meta(temp.path()), Some(meta));
        assert!(!needs_rebuild(temp.path(), Path::new("/w/notes")));

        assert!(needs_rebuild(temp.path(), Path::new("/w/other")));
        assert!(needs_rebuild(
            Path::new("/definitely/missing"),
            Path::new("/w/notes")
        ));
    }
}
