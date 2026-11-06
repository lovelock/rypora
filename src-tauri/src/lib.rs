pub mod commands;
pub mod config;
pub mod error;
pub mod search;
pub mod tree;
pub mod watcher;
pub mod workspace;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            app.manage(commands::AppState::new(config_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_workspace,
            commands::get_tree,
            commands::refresh_index,
            commands::create_entry,
            commands::rename_entry,
            commands::delete_entry,
            commands::move_entry,
            commands::read_file,
            commands::write_file,
            commands::search_files,
            commands::load_config_command,
            commands::save_config_command,
            commands::reveal_item,
            commands::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
