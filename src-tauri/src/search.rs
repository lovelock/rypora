use nucleo_matcher::{Config, Matcher, Utf32Str};
use serde::Serialize;
use std::path::Path;
use std::time::UNIX_EPOCH;
use walkdir::{DirEntry, WalkDir};

use crate::error::WorkspaceError;
use crate::tree::{is_markdown, is_skipped_dir};

#[derive(Debug, Clone)]
pub struct FileEntry {
    pub path: String,
    pub rel_path: String,
    pub name: String,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub rel_path: String,
    pub score: u32,
    pub indices: Vec<u32>,
}

pub struct FileIndex {
    entries: Vec<FileEntry>,
}

impl FileIndex {
    pub fn build(root: &Path) -> Result<Self, WorkspaceError> {
        let mut entries = Vec::new();
        let walker = WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .filter_entry(keep_entry);

        for item in walker {
            let Ok(entry) = item else {
                continue;
            };
            if !entry.file_type().is_file() || !is_markdown(entry.path()) {
                continue;
            }

            let relative = entry.path().strip_prefix(root).unwrap_or(entry.path());
            let rel_path = relative.to_string_lossy().replace('\\', "/");
            let name = entry.file_name().to_string_lossy().to_string();
            let modified_ms = entry
                .metadata()
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or(0);

            entries.push(FileEntry {
                path: entry.path().to_string_lossy().to_string(),
                rel_path,
                name,
                modified_ms,
            });
        }

        Ok(Self { entries })
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<SearchHit> {
        let tokens: Vec<&str> = query.split_whitespace().collect();
        if tokens.is_empty() {
            let mut recent: Vec<&FileEntry> = self.entries.iter().collect();
            recent.sort_by(|a, b| {
                b.modified_ms
                    .cmp(&a.modified_ms)
                    .then_with(|| a.rel_path.cmp(&b.rel_path))
            });
            return recent
                .into_iter()
                .take(limit)
                .map(|entry| SearchHit {
                    path: entry.path.clone(),
                    rel_path: entry.rel_path.clone(),
                    score: 0,
                    indices: Vec::new(),
                })
                .collect();
        }

        let mut matcher = Matcher::new(Config::DEFAULT);
        let mut hits = Vec::new();

        for entry in &self.entries {
            let mut total = 0u32;
            let mut indices = Vec::new();
            let mut matched_all = true;

            for token in &tokens {
                let mut haystack_buffer = Vec::new();
                let haystack = Utf32Str::new(&entry.rel_path, &mut haystack_buffer);
                // nucleo's ignore_case only folds the haystack; the needle must
                // already be lowercased for the ASCII prefilter to match.
                let lowered = token.to_lowercase();
                let mut needle_buffer = Vec::new();
                let needle = Utf32Str::new(&lowered, &mut needle_buffer);
                let mut token_indices = Vec::new();

                match matcher.fuzzy_indices(haystack, needle, &mut token_indices) {
                    Some(score) => {
                        total += u32::from(score);
                        indices.extend(token_indices);
                    }
                    None => {
                        matched_all = false;
                        break;
                    }
                }
            }

            if matched_all {
                indices.sort_unstable();
                indices.dedup();
                hits.push(SearchHit {
                    path: entry.path.clone(),
                    rel_path: entry.rel_path.clone(),
                    score: total,
                    indices,
                });
            }
        }

        hits.sort_by(|a, b| {
            b.score
                .cmp(&a.score)
                .then_with(|| a.rel_path.len().cmp(&b.rel_path.len()))
                .then_with(|| a.rel_path.cmp(&b.rel_path))
        });
        hits.truncate(limit);
        hits
    }
}

fn keep_entry(entry: &DirEntry) -> bool {
    if entry.depth() == 0 {
        return true;
    }
    let file_type = entry.file_type();
    if file_type.is_symlink() {
        return false;
    }
    if file_type.is_dir() {
        let name = entry.file_name().to_string_lossy();
        return !is_skipped_dir(name.as_ref());
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::thread::sleep;
    use std::time::Duration;
    use tempfile::tempdir;

    fn fixture() -> (tempfile::TempDir, FileIndex) {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("docs")).unwrap();
        fs::create_dir_all(dir.path().join("笔记")).unwrap();
        fs::write(dir.path().join("docs/report.md"), "").unwrap();
        sleep(Duration::from_millis(5));
        fs::write(dir.path().join("docs/notes.md"), "").unwrap();
        sleep(Duration::from_millis(5));
        fs::write(dir.path().join("笔记/我的笔记.md"), "").unwrap();
        sleep(Duration::from_millis(5));
        fs::write(dir.path().join("README.md"), "").unwrap();
        fs::write(dir.path().join("skip.txt"), "").unwrap();
        let index = FileIndex::build(dir.path()).unwrap();
        (dir, index)
    }

    #[test]
    fn indexes_only_markdown() {
        let (_dir, index) = fixture();
        assert_eq!(index.len(), 4);
    }

    #[test]
    fn matches_substring_and_fuzzy() {
        let (_dir, index) = fixture();
        let hits = index.search("report", 10);
        assert_eq!(hits[0].rel_path, "docs/report.md");
        assert!(!hits[0].indices.is_empty());

        let fuzzy = index.search("rpt", 10);
        assert!(fuzzy.iter().any(|hit| hit.rel_path == "docs/report.md"));
    }

    #[test]
    fn requires_all_tokens() {
        let (_dir, index) = fixture();
        let hits = index.search("docs rep", 10);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].rel_path, "docs/report.md");
    }

    #[test]
    fn is_case_insensitive_and_returns_empty_for_no_match() {
        let (_dir, index) = fixture();
        assert!(!index.search("REPORT", 10).is_empty());
        assert!(index.search("zzz", 10).is_empty());
    }

    #[test]
    fn empty_query_returns_recent_files_and_honours_limit() {
        let (_dir, index) = fixture();
        let hits = index.search("", 2);
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].rel_path, "README.md");
    }

    #[test]
    fn handles_unicode_indices() {
        let (_dir, index) = fixture();
        let hits = index.search("我的", 10);
        assert_eq!(hits.len(), 1);
        let chars: Vec<char> = hits[0].rel_path.chars().collect();
        for index in &hits[0].indices {
            assert!((*index as usize) < chars.len());
        }
    }
}
