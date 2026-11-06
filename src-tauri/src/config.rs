use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;

use crate::error::WorkspaceError;

pub const CONFIG_FILE: &str = "config.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TabState {
    pub path: String,
    pub cursor: u32,
    pub scroll_top: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub last_workspace: Option<String>,
    pub tabs: Vec<TabState>,
    pub active_tab: Option<String>,
    pub theme: String,
    pub sidebar_width: f64,
    pub font_size: f64,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            last_workspace: None,
            tabs: Vec::new(),
            active_tab: None,
            theme: "system".to_string(),
            sidebar_width: 260.0,
            font_size: 16.0,
        }
    }
}

pub fn load_config(dir: &Path) -> AppConfig {
    let path = dir.join(CONFIG_FILE);
    let Ok(text) = fs::read_to_string(path) else {
        return AppConfig::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn save_config(dir: &Path, config: &AppConfig) -> Result<(), WorkspaceError> {
    fs::create_dir_all(dir)?;
    let payload = serde_json::to_vec_pretty(config)
        .map_err(|error| WorkspaceError::Io(error.to_string()))?;

    let mut temp = tempfile::NamedTempFile::new_in(dir)?;
    temp.write_all(&payload)?;
    temp.as_file().sync_all()?;
    temp.persist(dir.join(CONFIG_FILE))
        .map_err(|error| WorkspaceError::Io(error.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn missing_config_returns_defaults() {
        let dir = tempdir().unwrap();
        let config = load_config(dir.path());
        assert_eq!(config, AppConfig::default());
        assert_eq!(config.theme, "system");
        assert_eq!(config.sidebar_width, 260.0);
        assert_eq!(config.font_size, 16.0);
    }

    #[test]
    fn corrupt_config_returns_defaults() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("config.json"), "{not json").unwrap();
        assert_eq!(load_config(dir.path()), AppConfig::default());
    }

    #[test]
    fn round_trips_config() {
        let dir = tempdir().unwrap();
        let config = AppConfig {
            last_workspace: Some("/tmp/notes".into()),
            tabs: vec![TabState {
                path: "/tmp/notes/a.md".into(),
                cursor: 42,
                scroll_top: 120.5,
            }],
            active_tab: Some("/tmp/notes/a.md".into()),
            theme: "dark".into(),
            sidebar_width: 300.0,
            font_size: 15.0,
        };
        save_config(dir.path(), &config).unwrap();
        assert_eq!(load_config(dir.path()), config);
    }

    #[test]
    fn creates_missing_directory() {
        let dir = tempdir().unwrap();
        let nested = dir.path().join("a/b/c");
        save_config(&nested, &AppConfig::default()).unwrap();
        assert!(nested.join("config.json").exists());
    }
}
