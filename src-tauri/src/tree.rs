use serde::Serialize;
use std::fs;
use std::path::Path;

use crate::error::WorkspaceError;

pub const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown", "mdown"];
const SKIPPED_DIRS: &[&str] = &["node_modules", "target", ".git", ".obsidian", "dist"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<FileNode>,
}

pub fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let ext = ext.to_ascii_lowercase();
            MARKDOWN_EXTENSIONS.contains(&ext.as_str())
        })
        .unwrap_or(false)
}

pub fn scan_tree(root: &Path) -> Result<FileNode, WorkspaceError> {
    let metadata = fs::metadata(root)?;
    if !metadata.is_dir() {
        return Err(WorkspaceError::NotFound(root.display().to_string()));
    }

    let name = root
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| root.display().to_string());

    let mut node = FileNode {
        name,
        path: root.to_string_lossy().to_string(),
        is_dir: true,
        children: Vec::new(),
    };
    scan_children(root, &mut node.children)?;
    Ok(node)
}

fn scan_children(dir: &Path, out: &mut Vec<FileNode>) -> Result<(), WorkspaceError> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();

        if file_type.is_dir() {
            if name.starts_with('.') || SKIPPED_DIRS.contains(&name.as_str()) {
                continue;
            }
            let mut node = FileNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                children: Vec::new(),
            };
            scan_children(&path, &mut node.children)?;
            out.push(node);
        } else if file_type.is_file() && is_markdown(&path) {
            out.push(FileNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                children: Vec::new(),
            });
        }
    }

    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn child_names(node: &FileNode) -> Vec<&str> {
        node.children.iter().map(|c| c.name.as_str()).collect()
    }

    #[test]
    fn scans_markdown_and_skips_noise() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("b.md"), "").unwrap();
        fs::write(dir.path().join("a.txt"), "").unwrap();
        fs::write(dir.path().join("c.MD"), "").unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join("sub/c.markdown"), "").unwrap();
        fs::create_dir(dir.path().join(".hidden")).unwrap();
        fs::write(dir.path().join(".hidden/x.md"), "").unwrap();
        fs::create_dir(dir.path().join("node_modules")).unwrap();
        fs::write(dir.path().join("node_modules/y.md"), "").unwrap();

        let tree = scan_tree(dir.path()).unwrap();
        assert!(tree.is_dir);
        assert_eq!(child_names(&tree), vec!["sub", "b.md", "c.MD"]);

        let sub = &tree.children[0];
        assert_eq!(child_names(sub), vec!["c.markdown"]);
    }

    #[test]
    fn is_markdown_is_case_insensitive() {
        assert!(is_markdown(Path::new("a.md")));
        assert!(is_markdown(Path::new("a.MARKDOWN")));
        assert!(is_markdown(Path::new("a.mdown")));
        assert!(!is_markdown(Path::new("a.txt")));
        assert!(!is_markdown(Path::new("a")));
    }

    #[test]
    fn rejects_missing_directory() {
        let err = scan_tree(Path::new("/definitely/not/here"));
        assert!(err.is_err());
    }
}
