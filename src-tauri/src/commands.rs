use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use parking_lot::{Mutex, RwLock};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::config::{load_config, save_config, AppConfig};
use crate::error::WorkspaceError;
use crate::index::query::TextHit;
use crate::index::service::IndexService;
use crate::index::worker::{IndexCommand, IndexStatus, StatusCallback};
use crate::search::{FileIndex, SearchHit};
use crate::tree::{scan_tree, FileNode};
use crate::watcher::{self, DebouncerHandle, SelfWrites};
use crate::workspace::{self, Eol, FileContent};

pub struct Workspace {
    pub root: PathBuf,
    pub index: FileIndex,
}

pub struct AppState {
    pub workspace: RwLock<Option<Workspace>>,
    pub config_dir: PathBuf,
    pub app_data_dir: PathBuf,
    pub index: Mutex<Option<IndexService>>,
    pub index_generation: AtomicU64,
    pub debouncer: Mutex<Option<DebouncerHandle>>,
    pub self_writes: SelfWrites,
}

impl AppState {
    pub fn new(config_dir: PathBuf, app_data_dir: PathBuf) -> Self {
        Self {
            workspace: RwLock::new(None),
            config_dir,
            app_data_dir,
            index: Mutex::new(None),
            index_generation: AtomicU64::new(0),
            debouncer: Mutex::new(None),
            self_writes: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub root: String,
    pub tree: FileNode,
}

fn message(error: WorkspaceError) -> String {
    error.to_string()
}

fn current_root(state: &AppState) -> Result<PathBuf, String> {
    state
        .workspace
        .read()
        .as_ref()
        .map(|workspace| workspace.root.clone())
        .ok_or_else(|| "no workspace is open".to_string())
}

fn current_index(state: &AppState) -> Option<IndexService> {
    state.index.lock().clone()
}

fn enqueue_index(state: &AppState, command: IndexCommand) {
    if let Some(service) = current_index(state) {
        service.enqueue(command);
    }
}

fn rebuild_index(state: &AppState) -> Result<(), String> {
    let root = current_root(state)?;
    let index = FileIndex::build(&root).map_err(message)?;
    if let Some(workspace) = state.workspace.write().as_mut() {
        workspace.index = index;
    }
    Ok(())
}

#[tauri::command]
pub fn open_workspace(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<WorkspaceSnapshot, String> {
    let root = std::fs::canonicalize(&path)
        .map_err(|error| WorkspaceError::from(error).to_string())?;
    if !root.is_dir() {
        return Err(WorkspaceError::NotFound(path).to_string());
    }

    let tree = scan_tree(&root).map_err(message)?;
    let index = FileIndex::build(&root).map_err(message)?;

    let _ = app.asset_protocol_scope().allow_directory(&root, true);

    let generation = state.index_generation.fetch_add(1, Ordering::SeqCst) + 1;
    if let Some(previous) = state.index.lock().take() {
        previous.shutdown();
    }
    let status_app = app.clone();
    let on_status: StatusCallback = Arc::new(move |status| {
        let _ = status_app.emit("index://progress", status);
    });
    let service = IndexService::open_at(&state.app_data_dir, &root, generation, on_status).ok();
    *state.index.lock() = service.clone();

    watcher::start(
        &app,
        &root,
        &state.debouncer,
        state.self_writes.clone(),
        service,
    )
    .map_err(message)?;

    *state.workspace.write() = Some(Workspace {
        root: root.clone(),
        index,
    });

    Ok(WorkspaceSnapshot {
        root: root.to_string_lossy().to_string(),
        tree,
    })
}

#[tauri::command]
pub fn get_tree(state: State<'_, AppState>) -> Result<FileNode, String> {
    let root = current_root(&state)?;
    scan_tree(&root).map_err(message)
}

#[tauri::command]
pub fn refresh_index(state: State<'_, AppState>) -> Result<(), String> {
    rebuild_index(&state)
}

#[tauri::command]
pub fn create_entry(
    state: State<'_, AppState>,
    parent: String,
    name: String,
    is_dir: bool,
) -> Result<String, String> {
    let path = workspace::create_entry(Path::new(&parent), &name, is_dir).map_err(message)?;
    let _ = rebuild_index(&state);
    enqueue_index(&state, IndexCommand::RefreshPath(path.clone()));
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn rename_entry(
    state: State<'_, AppState>,
    path: String,
    new_name: String,
) -> Result<String, String> {
    let old_path = PathBuf::from(&path);
    let renamed = workspace::rename_entry(Path::new(&path), &new_name).map_err(message)?;
    let _ = rebuild_index(&state);
    enqueue_index(&state, IndexCommand::RenamePrefix(old_path, renamed.clone()));
    Ok(renamed.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_entry(state: State<'_, AppState>, path: String) -> Result<(), String> {
    workspace::delete_entry(Path::new(&path)).map_err(message)?;
    let _ = rebuild_index(&state);
    enqueue_index(&state, IndexCommand::DeletePrefix(PathBuf::from(&path)));
    Ok(())
}

#[tauri::command]
pub fn move_entry(
    state: State<'_, AppState>,
    src: String,
    dest_dir: String,
) -> Result<String, String> {
    let source = PathBuf::from(&src);
    let moved = workspace::move_entry(Path::new(&src), Path::new(&dest_dir)).map_err(message)?;
    let _ = rebuild_index(&state);
    enqueue_index(&state, IndexCommand::RenamePrefix(source, moved.clone()));
    Ok(moved.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_file(path: String) -> Result<FileContent, String> {
    workspace::read_file(Path::new(&path)).map_err(message)
}

#[tauri::command]
pub fn write_file(
    state: State<'_, AppState>,
    path: String,
    text: String,
    eol: Eol,
    expected_mtime_ms: u64,
) -> Result<u64, String> {
    let target = PathBuf::from(&path);
    watcher::mark_self_write(&state.self_writes, &target);
    if let Some(parent) = target.parent() {
        watcher::mark_self_write(&state.self_writes, parent);
    }
    let result = workspace::write_file_atomic(&target, &text, eol, expected_mtime_ms).map_err(message);
    watcher::mark_self_write(&state.self_writes, &target);
    if let Some(parent) = target.parent() {
        watcher::mark_self_write(&state.self_writes, parent);
    }
    if result.is_ok() {
        enqueue_index(&state, IndexCommand::RefreshPath(target));
    }
    result
}

#[tauri::command]
pub fn save_file_as(
    state: State<'_, AppState>,
    path: String,
    text: String,
    eol: Eol,
) -> Result<u64, String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        watcher::mark_self_write(&state.self_writes, parent);
    }
    let result = workspace::write_new_file(&target, &text, eol).map_err(message);
    if let Some(parent) = target.parent() {
        watcher::mark_self_write(&state.self_writes, parent);
    }
    if result.is_ok() {
        enqueue_index(&state, IndexCommand::RefreshPath(target));
    }
    result
}

#[tauri::command]
pub fn search_files(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Vec<SearchHit> {
    state
        .workspace
        .read()
        .as_ref()
        .map(|workspace| workspace.index.search(&query, limit.unwrap_or(50)))
        .unwrap_or_default()
}

#[tauri::command]
pub fn load_config_command(state: State<'_, AppState>) -> AppConfig {
    load_config(&state.config_dir)
}

#[tauri::command]
pub fn save_config_command(
    state: State<'_, AppState>,
    config: AppConfig,
) -> Result<(), String> {
    save_config(&state.config_dir, &config).map_err(message)
}

#[tauri::command]
pub fn reveal_item(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(Path::new(&path))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<String>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn search_text(
    app: AppHandle,
    query: String,
    limit: Option<usize>,
    exclude_paths: Option<Vec<String>>,
) -> Result<Vec<TextHit>, String> {
    let service = { app.state::<AppState>().index.lock().clone() };
    let Some(service) = service else {
        return Err("full-text index unavailable".to_string());
    };
    let exclude = exclude_paths.unwrap_or_default();
    let limit = limit.unwrap_or(30);

    tauri::async_runtime::spawn_blocking(move || service.search(&query, &exclude, limit))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn index_status(app: AppHandle) -> IndexStatus {
    let service = { app.state::<AppState>().index.lock().clone() };
    service
        .map(|service| service.status())
        .unwrap_or_else(|| IndexStatus::unavailable(0))
}

#[tauri::command]
pub fn reindex_workspace(app: AppHandle) -> Result<(), String> {
    let service = { app.state::<AppState>().index.lock().clone() };
    let Some(service) = service else {
        return Err("full-text index unavailable".to_string());
    };
    service.rebuild();
    Ok(())
}

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
const MAX_ATTACHMENT_BYTES: usize = 20 * 1024 * 1024;

fn attachment_filename(name: &str) -> Result<String, String> {
    let path = Path::new(name);
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "invalid attachment name".to_string())?;

    if filename != name || filename.is_empty() || filename.starts_with('.') {
        return Err("invalid attachment name".to_string());
    }

    if !filename
        .chars()
        .all(|value| value.is_ascii_alphanumeric() || value == '.' || value == '_' || value == '-')
    {
        return Err("invalid attachment name".to_string());
    }

    let extension = Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err("unsupported image type".to_string());
    }

    Ok(filename.to_string())
}

fn save_attachment_at(
    root: &Path,
    note_path: &str,
    name: &str,
    bytes: &[u8],
) -> Result<String, String> {
    if bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err("image is too large".to_string());
    }

    let filename = attachment_filename(name)?;
    let note = Path::new(note_path);
    let note_dir = note
        .parent()
        .ok_or_else(|| "invalid note path".to_string())?;

    let root = root.canonicalize().map_err(|error| error.to_string())?;
    let note_dir = note_dir.canonicalize().map_err(|error| error.to_string())?;
    if !note_dir.starts_with(&root) {
        return Err("note is outside the workspace".to_string());
    }

    let directory = note_dir.join("assets");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let directory = directory.canonicalize().map_err(|error| error.to_string())?;
    if !directory.starts_with(&root) {
        return Err("assets directory is outside the workspace".to_string());
    }

    let stem = Path::new(&filename)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let extension = Path::new(&filename)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png");

    let mut counter = 0;
    let target = loop {
        let candidate = if counter == 0 {
            filename.clone()
        } else {
            format!("{stem}-{counter}.{extension}")
        };
        let target = directory.join(&candidate);
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(mut file) => {
                std::io::Write::write_all(&mut file, bytes).map_err(|error| error.to_string())?;
                break target;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                counter += 1;
            }
            Err(error) => return Err(error.to_string()),
        }
    };

    let saved = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "invalid attachment name".to_string())?;

    Ok(format!("assets/{saved}"))
}

#[tauri::command]
pub async fn save_attachment(
    state: State<'_, AppState>,
    note_path: String,
    name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let root = current_root(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        save_attachment_at(&root, &note_path, &name, &bytes)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{attachment_filename, save_attachment_at};

    #[test]
    fn accepts_image_names() {
        assert_eq!(attachment_filename("pasted-1.png").unwrap(), "pasted-1.png");
        assert_eq!(attachment_filename("photo.JPG").unwrap(), "photo.JPG");
    }

    #[test]
    fn rejects_paths_and_non_images() {
        assert!(attachment_filename("../evil.png").is_err());
        assert!(attachment_filename("a/b.png").is_err());
        assert!(attachment_filename("notes.txt").is_err());
        assert!(attachment_filename("").is_err());
        assert!(attachment_filename(".hidden.png").is_err());
        assert!(attachment_filename("a b.png").is_err());
    }

    #[test]
    fn writes_into_the_note_assets_directory() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let notes = root.join("notes");
        std::fs::create_dir_all(&notes).unwrap();
        let note = notes.join("a.md");

        let saved =
            save_attachment_at(&root, &note.to_string_lossy(), "pasted-1.png", b"png").unwrap();

        assert_eq!(saved, "assets/pasted-1.png");
        assert_eq!(
            std::fs::read(notes.join("assets/pasted-1.png")).unwrap(),
            b"png"
        );
    }

    #[test]
    fn rejects_a_note_outside_the_workspace() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let note = outside.path().join("a.md");

        assert!(save_attachment_at(
            root.path(),
            &note.to_string_lossy(),
            "pasted-1.png",
            b"png"
        )
        .is_err());
    }

    #[test]
    fn avoids_overwriting_existing_files() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let note = root.join("a.md");

        assert_eq!(
            save_attachment_at(&root, &note.to_string_lossy(), "pasted-1.png", b"a").unwrap(),
            "assets/pasted-1.png"
        );
        assert_eq!(
            save_attachment_at(&root, &note.to_string_lossy(), "pasted-1.png", b"b").unwrap(),
            "assets/pasted-1-1.png"
        );
    }
}
