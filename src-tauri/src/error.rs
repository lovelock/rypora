use std::io;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum WorkspaceError {
    #[error("not-found: {0}")]
    NotFound(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("invalid-name: {0}")]
    InvalidName(String),
    #[error("too-large: {0}")]
    TooLarge(String),
    #[error("invalid-utf8: {0}")]
    InvalidUtf8(String),
    #[error("io: {0}")]
    Io(String),
}

impl From<io::Error> for WorkspaceError {
    fn from(value: io::Error) -> Self {
        match value.kind() {
            io::ErrorKind::NotFound => WorkspaceError::NotFound(value.to_string()),
            io::ErrorKind::AlreadyExists => WorkspaceError::Conflict(value.to_string()),
            _ => WorkspaceError::Io(value.to_string()),
        }
    }
}
