//! Update installation capability detection.

use serde::Serialize;

use crate::error::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdateInstallationMode {
    Automatic,
    ManualDownloadOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInstallationCapability {
    pub mode: UpdateInstallationMode,
}

fn installation_capability_for(
    target_os: &str,
    running_appimage: bool,
) -> UpdateInstallationCapability {
    let mode = match target_os {
        "windows" | "macos" => UpdateInstallationMode::Automatic,
        "linux" if running_appimage => UpdateInstallationMode::Automatic,
        _ => UpdateInstallationMode::ManualDownloadOnly,
    };

    UpdateInstallationCapability { mode }
}

#[tauri::command]
pub fn update_installation_capability() -> Result<UpdateInstallationCapability, AppError> {
    let target_os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "other"
    };

    Ok(installation_capability_for(
        target_os,
        std::env::var_os("APPIMAGE").is_some(),
    ))
}

#[cfg(test)]
mod tests {
    use super::{installation_capability_for, UpdateInstallationMode};

    #[test]
    fn windows_and_macos_support_automatic_installation() {
        assert_eq!(
            installation_capability_for("windows", false).mode,
            UpdateInstallationMode::Automatic
        );
        assert_eq!(
            installation_capability_for("macos", false).mode,
            UpdateInstallationMode::Automatic
        );
    }

    #[test]
    fn only_appimage_linux_supports_automatic_installation() {
        assert_eq!(
            installation_capability_for("linux", true).mode,
            UpdateInstallationMode::Automatic
        );
        assert_eq!(
            installation_capability_for("linux", false).mode,
            UpdateInstallationMode::ManualDownloadOnly
        );
    }

    #[test]
    fn unsupported_targets_are_manual_download_only() {
        assert_eq!(
            installation_capability_for("freebsd", true).mode,
            UpdateInstallationMode::ManualDownloadOnly
        );
    }
}
