fn main() {
    // Подхватываем src-tauri/.env как compile-time env-переменные (для удобного
    // фолбэка DISCORD_CLIENT_ID у разработчика — см. discord_rpc.rs).
    // Файл опционален: в CI его нет → option_env! вернёт None, и пользователь
    // вводит свой Client ID прямо в настройках приложения.
    if let Ok(contents) = std::fs::read_to_string(".env") {
        for line in contents.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, value)) = line.split_once('=') {
                println!("cargo:rustc-env={}={}", key.trim(), value.trim());
            }
        }
    }
    println!("cargo:rerun-if-changed=.env");

    tauri_build::build()
}
