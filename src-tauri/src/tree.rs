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
