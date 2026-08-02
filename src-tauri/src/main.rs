#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            use tauri::{Emitter, Manager};
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            if let Some(file) = notem::commands::startup::markdown_from_args(
                &args,
                Some(std::path::Path::new(&cwd)),
            ) {
                let _ = app.emit("notem://open-file", file);
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(notem::commands::vault::CurrentVault::default())
        .manage(notem::commands::vault::CurrentWatcher::default())
        .manage(notem::commands::performance::PerformanceState::default())
        .manage(notem::commands::startup::PendingStartupFile::default())
        .invoke_handler(tauri::generate_handler![
            notem::commands::vault::vault_open,
            notem::commands::vault::vault_list,
            notem::commands::files::file_info,
            notem::commands::files::file_read,
            notem::commands::files::file_write,
            notem::commands::files::file_write_force,
            notem::commands::files::file_create,
            notem::commands::files::file_create_at,
            notem::commands::files::file_create_with_content,
            notem::commands::files::attachment_import,
            notem::commands::files::attachment_import_bytes,
            notem::commands::files::attachment_resolve,
            notem::commands::files::path_import,
            notem::commands::files::folder_create,
            notem::commands::files::file_rename,
            notem::commands::files::file_move,
            notem::commands::files::file_delete,
            notem::commands::files::file_reveal,
            notem::commands::files::file_open_external,
            notem::commands::files::url_open_external,
            notem::commands::settings::settings_get,
            notem::commands::settings::settings_set,
            notem::commands::settings::vault_settings_get,
            notem::commands::settings::vault_settings_set,
            notem::commands::updater::update_installation_capability,
            notem::commands::frontmatter::frontmatter_get,
            notem::commands::frontmatter::frontmatter_set,
            notem::commands::search::search_filename,
            notem::commands::search::search_fts,
            notem::commands::links::links_backlinks,
            notem::commands::links::links_link_unlinked,
            notem::commands::links::links_graph,
            notem::commands::tags::tags_all,
            notem::commands::tags::outline_headings,
            notem::commands::tags::outline_move,
            notem::commands::index::index_rebuild,
            notem::commands::performance::debug_frontend_ready,
            notem::commands::performance::debug_timings,
            notem::commands::startup::startup_file,
            notem::commands::window::window_open_note,
        ])
        .build(tauri::generate_context!())
        .expect("error while building NoteM")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                use tauri::{Emitter, Manager};
                if let Some(file) = urls.into_iter().find_map(|url| {
                    url.to_file_path()
                        .ok()
                        .and_then(notem::commands::startup::markdown_path)
                }) {
                    if let Ok(mut pending) = _app
                        .state::<notem::commands::startup::PendingStartupFile>()
                        .0
                        .lock()
                    {
                        *pending = Some(file.clone());
                    }
                    let _ = _app.emit("notem://open-file", file);
                }
            }
        });
}
