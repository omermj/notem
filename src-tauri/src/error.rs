use serde::ser::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("no vault is open")]
    NoVault,
    #[error("invalid vault-relative path: {0}")]
    InvalidPath(String),
    #[error("conflict: {0} was modified outside NoteM")]
    Conflict(String),
    #[error("vault unavailable: {0}")]
    VaultUnavailable(String),
    #[error("trash error: {0}")]
    Trash(String),
    #[error("{0}")]
    Message(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
