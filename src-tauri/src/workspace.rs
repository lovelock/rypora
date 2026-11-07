use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::error::WorkspaceError;
use crate::tree::MARKDOWN_EXTENSIONS;

pub const MAX_FILE_SIZE: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Eol {
    Lf,
    Crlf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub text: String,
    pub eol: Eol,
    pub mtime_ms: u64,
}

pub fn validate_name(name: &str) -> Result<(), WorkspaceError> {
    if name.is_empty() || name == "." || name == ".." {
        return Err(WorkspaceError::InvalidName(name.to_string()));
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err(WorkspaceError::InvalidName(name.to_string()));
    }
    Ok(())
}

fn ensure_markdown_name(name: &str) -> Result<String, WorkspaceError> {
    match Path::new(name).extension().and_then(|value| value.to_str()) {
        None => Ok(format!("{name}.md")),
        Some(extension) => {
            let extension = extension.to_ascii_lowercase();
            if MARKDOWN_EXTENSIONS.contains(&extension.as_str()) {
                Ok(name.to_string())
            } else {
                Err(WorkspaceError::InvalidName(format!(
                    "{name}: only markdown files are supported"
                )))
            }
        }
    }
}

pub fn read_file(path: &Path) -> Result<FileContent, WorkspaceError> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() {
        return Err(WorkspaceError::NotFound(path.display().to_string()));
    }
    if metadata.len() > MAX_FILE_SIZE {
        return Err(WorkspaceError::TooLarge(path.display().to_string()));
    }

    let bytes = fs::read(path)?;
    let text = String::from_utf8(bytes)
        .map_err(|_| WorkspaceError::InvalidUtf8(path.display().to_string()))?;

    let eol = if text.contains("\r\n") {
        Eol::Crlf
    } else {
        Eol::Lf
    };
    let text = if eol == Eol::Crlf {
        text.replace("\r\n", "\n")
    } else {
        text
    };

    Ok(FileContent {
        text,
        eol,
        mtime_ms: mtime_ms(&metadata),
    })
}

pub fn write_file_atomic(
    path: &Path,
    text: &str,
    eol: Eol,
    expected_mtime_ms: u64,
) -> Result<u64, WorkspaceError> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() {
        return Err(WorkspaceError::NotFound(path.display().to_string()));
    }
    if mtime_ms(&metadata) != expected_mtime_ms {
        return Err(WorkspaceError::Conflict(path.display().to_string()));
    }

    let payload = match eol {
        Eol::Crlf => text.replace('\n', "\r\n"),
        Eol::Lf => text.to_string(),
    };

    let parent = path
        .parent()
        .ok_or_else(|| WorkspaceError::InvalidName(path.display().to_string()))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.write_all(payload.as_bytes())?;
    temp.as_file().sync_all()?;
    let _ = fs::set_permissions(temp.path(), metadata.permissions());
    temp.persist(path)
        .map_err(|error| WorkspaceError::Io(error.to_string()))?;

    let updated = fs::metadata(path)?;
    Ok(mtime_ms(&updated))
}

pub fn write_new_file(path: &Path, text: &str, eol: Eol) -> Result<u64, WorkspaceError> {
    let parent = path
        .parent()
        .ok_or_else(|| WorkspaceError::InvalidName(path.display().to_string()))?;
    if let Some(name) = path.file_name() {
        validate_name(&name.to_string_lossy())?;
    }

    let payload = match eol {
        Eol::Crlf => text.replace('\n', "\r\n"),
        Eol::Lf => text.to_string(),
    };

    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.write_all(payload.as_bytes())?;
    temp.as_file().sync_all()?;
    temp.persist(path)
        .map_err(|error| WorkspaceError::Io(error.to_string()))?;

    let metadata = fs::metadata(path)?;
    Ok(mtime_ms(&metadata))
}

pub fn create_entry(parent: &Path, name: &str, is_dir: bool) -> Result<PathBuf, WorkspaceError> {    validate_name(name)?;
    if !parent.is_dir() {
        return Err(WorkspaceError::NotFound(parent.display().to_string()));
    }

    let final_name = if is_dir {
        name.to_string()
    } else {
        ensure_markdown_name(name)?
    };

    let target = parent.join(&final_name);
    if target.exists() {
        return Err(WorkspaceError::Conflict(target.display().to_string()));
    }

    if is_dir {
        fs::create_dir(&target)?;
    } else {
        fs::write(&target, "")?;
    }
    Ok(target)
}

pub fn rename_entry(path: &Path, new_name: &str) -> Result<PathBuf, WorkspaceError> {
    validate_name(new_name)?;
    let is_file = fs::metadata(path)?.is_file();
    let new_name = if is_file {
        ensure_markdown_name(new_name)?
    } else {
        new_name.to_string()
    };
    let parent = path
        .parent()
        .ok_or_else(|| WorkspaceError::NotFound(path.display().to_string()))?;
    let target = parent.join(&new_name);
    if target.exists() {
        return Err(WorkspaceError::Conflict(target.display().to_string()));
    }
    fs::rename(path, &target)?;
    Ok(target)
}

pub fn delete_entry(path: &Path) -> Result<(), WorkspaceError> {
    if !path.exists() {
        return Err(WorkspaceError::NotFound(path.display().to_string()));
    }
    trash::delete(path).map_err(|error| WorkspaceError::Io(error.to_string()))
}

pub fn move_entry(src: &Path, dest_dir: &Path) -> Result<PathBuf, WorkspaceError> {    if !dest_dir.is_dir() {
        return Err(WorkspaceError::NotFound(dest_dir.display().to_string()));
    }
    let file_name = src
        .file_name()
        .ok_or_else(|| WorkspaceError::InvalidName(src.display().to_string()))?;
    let target = dest_dir.join(file_name);

    if src == target {
        return Ok(target);
    }
    if target.exists() {
        return Err(WorkspaceError::Conflict(target.display().to_string()));
    }
    if src.is_dir() {
        let source = fs::canonicalize(src)?;
        let destination = fs::canonicalize(dest_dir)?;
        if destination.starts_with(&source) {
            return Err(WorkspaceError::InvalidName(
                "cannot move a folder into itself".to_string(),
            ));
        }
    }

    fs::rename(src, &target)?;
    Ok(target)
}

fn mtime_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn validate_name_rejects_bad_input() {
        assert!(validate_name("").is_err());
        assert!(validate_name(".").is_err());
        assert!(validate_name("..").is_err());
        assert!(validate_name("a/b").is_err());
        assert!(validate_name("a\\b").is_err());
        assert!(validate_name("note").is_ok());
        assert!(validate_name("我的笔记").is_ok());
    }

    #[test]
    fn reads_and_preserves_crlf() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("note.md");
        let original = b"# hi\r\n\r\nbody\r\n";
        fs::write(&path, original).unwrap();

        let content = read_file(&path).unwrap();
        assert_eq!(content.eol, Eol::Crlf);
        assert_eq!(content.text, "# hi\n\nbody\n");

        write_file_atomic(&path, &content.text, content.eol, content.mtime_ms).unwrap();
        assert_eq!(fs::read(&path).unwrap(), original);
    }

    #[test]
    fn write_rejects_stale_mtime() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "one\n").unwrap();
        let content = read_file(&path).unwrap();

        let err = write_file_atomic(&path, "two\n", content.eol, content.mtime_ms - 1);
        assert!(matches!(err, Err(WorkspaceError::Conflict(_))));

        write_file_atomic(&path, "three\n", content.eol, content.mtime_ms).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "three\n");
    }

    #[test]
    fn creates_file_with_md_extension() {
        let dir = tempdir().unwrap();
        let path = create_entry(dir.path(), "note", false).unwrap();
        assert_eq!(path.file_name().unwrap(), "note.md");
        assert!(path.exists());

        let again = create_entry(dir.path(), "note", false);
        assert!(matches!(again, Err(WorkspaceError::Conflict(_))));
    }

    #[test]
    fn rejects_non_markdown_file_names() {
        let dir = tempdir().unwrap();
        let result = create_entry(dir.path(), "note.txt", false);
        assert!(matches!(result, Err(WorkspaceError::InvalidName(_))));
    }

    #[test]
    fn writes_new_files_and_preserves_crlf() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("saved.md");
        write_new_file(&path, "# hi\n", Eol::Crlf).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"# hi\r\n");
    }

    #[test]
    fn renames_and_moves_entries() {
        let dir = tempdir().unwrap();
        let path = create_entry(dir.path(), "note", false).unwrap();
        let renamed = rename_entry(&path, "renamed.md").unwrap();
        assert!(!path.exists());
        assert!(renamed.exists());

        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        let moved = move_entry(&renamed, &sub).unwrap();
        assert_eq!(moved.parent().unwrap(), sub);
        assert!(moved.exists());
    }

    #[test]
    fn rejects_oversized_and_binary_files() {
        let dir = tempdir().unwrap();
        let big = dir.path().join("big.md");
        fs::write(&big, vec![b'a'; (MAX_FILE_SIZE + 1) as usize]).unwrap();
        assert!(matches!(read_file(&big), Err(WorkspaceError::TooLarge(_))));

        let binary = dir.path().join("binary.md");
        fs::write(&binary, [0xff, 0xfe, 0x00]).unwrap();
        assert!(read_file(&binary).is_err());
    }
}
