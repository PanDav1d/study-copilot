// Study Copilot desktop shell.
//
// The app itself is the Next.js server, bundled together with a Node runtime.
// This shell
//   - lets the user pick a data folder (e.g. in iCloud Drive) and remembers it,
//   - starts the server on a random 127.0.0.1 port with a per-launch sign-in token,
//   - guards against opening the same folder on two Macs at once (lock + heartbeat),
//   - makes sure iCloud has downloaded the database before it is opened,
//   - provides the native menu bar; its commands run in the web app (see below).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, File};
use std::io::Read;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::menu::{
    AboutMetadata, CheckMenuItem, CheckMenuItemBuilder, Menu, MenuItem, MenuItemBuilder, Submenu, SubmenuBuilder,
    HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
};
use tauri::tray::TrayIconBuilder;
use tauri::webview::DownloadEvent;
use tauri::{AppHandle, Manager, RunEvent, Url, WebviewWindowBuilder, Wry};
use tauri_plugin_dialog::DialogExt;

const LOCK_FILE: &str = "study.lock";
const LOCK_STALE_SECS: u64 = 120;
const HEARTBEAT: Duration = Duration::from_secs(30);

// ---------------------------------------------------------------------------
// Config (stays on this Mac – the data folder may be shared via iCloud)
// ---------------------------------------------------------------------------

#[derive(Default, Serialize, Deserialize)]
struct Config {
    data_dir: Option<PathBuf>,
    auth_secret: Option<String>,
    /// Page zoom of the window (Darstellung → Vergrößern / Verkleinern).
    #[serde(default)]
    zoom: Option<f64>,
}

fn config_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

fn load_config(app: &AppHandle) -> Config {
    config_file(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_config(app: &AppHandle, config: &Config) -> Result<(), String> {
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(config_file(app)?, json).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buf))
        .expect("no randomness available");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn command_output(cmd: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(cmd).args(args).output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (out.status.success() && !s.is_empty()).then_some(s)
}

fn host_name() -> String {
    command_output("scutil", &["--get", "ComputerName"]).unwrap_or_else(|| "dieser Mac".into())
}

/// Development only: `STUDY_COPILOT_DATA_DIR=/some/test/folder cargo tauri dev` runs on that
/// folder instead of the configured one (and does not save it) – try things without real data.
fn data_dir_override() -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    std::env::var_os("STUDY_COPILOT_DATA_DIR").map(PathBuf::from)
}

fn icloud_suggestion() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let drive = Path::new(&home).join("Library/Mobile Documents/com~apple~CloudDocs");
    drive.is_dir().then(|| drive.join("Study Copilot"))
}

/// iCloud may have offloaded the database ("Optimize Mac Storage"): request it and wait.
fn ensure_downloaded(file: &Path) {
    if file.exists() {
        return;
    }
    let name = file.file_name().unwrap_or_default().to_string_lossy();
    let placeholder = file.with_file_name(format!(".{name}.icloud"));
    if !placeholder.exists() {
        return;
    }
    let _ = Command::new("brctl").arg("download").arg(file).status();
    let start = Instant::now();
    while !file.exists() && start.elapsed() < Duration::from_secs(120) {
        thread::sleep(Duration::from_millis(500));
    }
}

// ---------------------------------------------------------------------------
// Lock: one Mac at a time per data folder
// ---------------------------------------------------------------------------

fn read_lock(dir: &Path) -> Option<(String, u64)> {
    let content = fs::read_to_string(dir.join(LOCK_FILE)).ok()?;
    let mut lines = content.lines();
    let host = lines.next()?.to_string();
    let ts = lines.nth(1)?.parse().ok()?;
    Some((host, ts))
}

fn write_lock(dir: &Path) {
    write_lock_as(dir, &host_name());
}

/// `scutil` is a subprocess – the heartbeat resolves the host name once and reuses it.
fn write_lock_as(dir: &Path, host: &str) {
    let _ = fs::write(dir.join(LOCK_FILE), format!("{host}\n{}\n{}\n", std::process::id(), now_secs()));
}

fn remove_lock(dir: &Path) {
    if matches!(read_lock(dir), Some((host, _)) if host == host_name()) {
        let _ = fs::remove_file(dir.join(LOCK_FILE));
    }
}

/// Another Mac that is still alive (fresh heartbeat) has the folder open.
fn foreign_lock(dir: &Path) -> Option<(String, u64)> {
    let (host, ts) = read_lock(dir)?;
    let age = now_secs().saturating_sub(ts);
    (host != host_name() && age < LOCK_STALE_SECS).then_some((host, age))
}

// ---------------------------------------------------------------------------
// Server process
// ---------------------------------------------------------------------------

struct Server {
    child: Child,
    url: String,
    data_dir: PathBuf,
    stop_heartbeat: Arc<AtomicBool>,
    heartbeat: thread::JoinHandle<()>,
}

#[derive(Default)]
struct AppState {
    server: Mutex<Option<Server>>,
    menu: Mutex<MenuItems>,
    tray: Mutex<TrayTimer>,
}

fn log_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("server.log"))
}

fn start_server(app: &AppHandle, dir: &Path, secret: &str) -> Result<Server, String> {
    let port = TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map_err(|e| format!("Kein freier Port: {e}"))?
        .port();
    let token = random_hex(32);
    let server_dir = app.path().resource_dir().map_err(|e| e.to_string())?.join("server");
    let node = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .with_file_name("node");
    let log_path = log_file(app)?;
    let log = File::create(&log_path).map_err(|e| e.to_string())?;

    let mut child = Command::new(&node)
        .arg(server_dir.join("server-entry.mjs"))
        .current_dir(&server_dir)
        .env("NODE_ENV", "production")
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env("HOSTNAME", "127.0.0.1")
        .env("PORT", port.to_string())
        .env("DATA_DIR", dir)
        .env("DATABASE_URL", format!("file:{}", dir.join("study.db").display()))
        .env("UPLOAD_DIR", dir.join("Unterlagen"))
        .env("AUTH_SECRET", secret)
        .env("DESKTOP_TOKEN", &token)
        .env("DESKTOP_USER_NAME", command_output("id", &["-F"]).unwrap_or_default())
        .stdin(Stdio::null())
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log)
        .spawn()
        .map_err(|e| format!("Server konnte nicht gestartet werden ({}): {e}", node.display()))?;

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let start = Instant::now();
    loop {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok() {
            break;
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("Der Server wurde beendet ({status}). Details im Log: {}", log_path.display()));
        }
        if start.elapsed() > Duration::from_secs(60) {
            let _ = child.kill();
            return Err(format!("Der Server antwortet nicht. Details im Log: {}", log_path.display()));
        }
        thread::sleep(Duration::from_millis(150));
    }

    write_lock(dir);
    let stop = Arc::new(AtomicBool::new(false));
    // The thread sleeps for the whole interval (one wake-up per 30 s instead of
    // one per second – fewer CPU wake-ups, less energy) and is unparked on stop.
    let heartbeat = {
        let stop = stop.clone();
        let dir = dir.to_path_buf();
        thread::spawn(move || {
            let host = host_name();
            loop {
                thread::park_timeout(HEARTBEAT);
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                write_lock_as(&dir, &host);
            }
        })
    };

    Ok(Server {
        child,
        url: format!("http://127.0.0.1:{port}/api/desktop/session?token={token}"),
        data_dir: dir.to_path_buf(),
        stop_heartbeat: stop,
        heartbeat,
    })
}

fn stop_server(app: &AppHandle) {
    let Some(mut server) = app.state::<AppState>().server.lock().unwrap().take() else { return };
    server.stop_heartbeat.store(true, Ordering::Relaxed);
    server.heartbeat.thread().unpark();
    // SIGTERM first so the server can finish a running write.
    let _ = Command::new("kill").arg("-TERM").arg(server.child.id().to_string()).status();
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(3) {
        if let Ok(Some(_)) = server.child.try_wait() {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    let _ = server.child.kill();
    let _ = server.child.wait();
    remove_lock(&server.data_dir);
}

// ---------------------------------------------------------------------------
// Commands for the start screen (ui/index.html)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(tag = "state", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum Boot {
    NeedsFolder { suggested: Option<String> },
    Locked { host: String, seconds_ago: u64, folder: String },
    Ready { url: String },
    Failed { message: String, log: Option<String> },
}

fn boot_blocking(app: &AppHandle, force: bool) -> Boot {
    if let Some(server) = app.state::<AppState>().server.lock().unwrap().as_ref() {
        return Boot::Ready { url: server.url.clone() };
    }
    let mut config = load_config(app);
    let Some(dir) = data_dir_override().or_else(|| config.data_dir.clone()).filter(|d| d.is_dir()) else {
        return Boot::NeedsFolder { suggested: icloud_suggestion().map(|p| p.display().to_string()) };
    };
    if !force {
        if let Some((host, seconds_ago)) = foreign_lock(&dir) {
            return Boot::Locked { host, seconds_ago, folder: dir.display().to_string() };
        }
    }
    ensure_downloaded(&dir.join("study.db"));

    let secret = match config.auth_secret.clone() {
        Some(s) => s,
        None => {
            let s = random_hex(48);
            config.auth_secret = Some(s.clone());
            if let Err(e) = save_config(app, &config) {
                return Boot::Failed { message: e, log: None };
            }
            s
        }
    };
    match start_server(app, &dir, &secret) {
        Ok(server) => {
            let url = server.url.clone();
            *app.state::<AppState>().server.lock().unwrap() = Some(server);
            Boot::Ready { url }
        }
        Err(message) => Boot::Failed { message, log: log_file(app).ok().map(|p| p.display().to_string()) },
    }
}

#[tauri::command]
async fn boot(app: AppHandle, force: bool) -> Boot {
    tauri::async_runtime::spawn_blocking(move || boot_blocking(&app, force))
        .await
        .unwrap_or_else(|e| Boot::Failed { message: e.to_string(), log: None })
}

/// Use (and create) a folder as data folder.
#[tauri::command]
fn use_folder(app: AppHandle, path: String) -> Result<String, String> {
    let dir = PathBuf::from(path);
    fs::create_dir_all(&dir).map_err(|e| format!("Ordner kann nicht angelegt werden: {e}"))?;
    let probe = dir.join(".write-test");
    fs::write(&probe, b"ok").map_err(|e| format!("Keine Schreibrechte in diesem Ordner: {e}"))?;
    let _ = fs::remove_file(probe);
    let mut config = load_config(&app);
    config.data_dir = Some(dir.clone());
    save_config(&app, &config)?;
    Ok(dir.display().to_string())
}

#[tauri::command]
async fn choose_folder(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Datenordner wählen")
        .blocking_pick_folder();
    match picked.and_then(|p| p.into_path().ok()) {
        Some(path) => use_folder(app, path.display().to_string()).map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
fn reveal(path: String) {
    let _ = Command::new("open").arg(path).status();
}

// ---------------------------------------------------------------------------
// Menu bar
//
// Items with a dotted id ("note.mode.read") are commands of the web app, with
// the same ids, labels and shortcuts as in src/lib/commands.ts
// (tests/commands.test.ts checks that both stay in sync). A click is
// dispatched into the page as a `study:command` event; the page reports which
// items are available and ticked via `studycopilot://localhost/menu?s=…`.
// The webview never gets access to Tauri itself.
//
// Shortcuts: WebKit hands a key to the page first and only passes it on to the
// menu if the page did not handle it, so every shortcut runs exactly once.
// ---------------------------------------------------------------------------

#[derive(Default)]
struct MenuItems {
    items: Vec<MenuItem<Wry>>,
    checks: Vec<CheckMenuItem<Wry>>,
}

/// Groups of check items where exactly one is ticked.
const RADIO_GROUPS: &[&[&str]] = &[&["note.mode.edit", "note.mode.read", "note.mode.recall"]];

fn cmd(app: &AppHandle, reg: &mut MenuItems, id: &str, label: &str, accel: Option<&str>) -> tauri::Result<MenuItem<Wry>> {
    let mut builder = MenuItemBuilder::with_id(id, label);
    if let Some(a) = accel {
        builder = builder.accelerator(a);
    }
    let item = builder.build(app)?;
    reg.items.push(item.clone());
    Ok(item)
}

fn check(app: &AppHandle, reg: &mut MenuItems, id: &str, label: &str, accel: Option<&str>) -> tauri::Result<CheckMenuItem<Wry>> {
    let mut builder = CheckMenuItemBuilder::with_id(id, label).checked(false);
    if let Some(a) = accel {
        builder = builder.accelerator(a);
    }
    let item = builder.build(app)?;
    reg.checks.push(item.clone());
    Ok(item)
}

/// Handled here in the shell, not in the page.
fn native(app: &AppHandle, id: &str, label: &str, accel: Option<&str>) -> tauri::Result<MenuItem<Wry>> {
    let mut builder = MenuItemBuilder::with_id(id, label);
    if let Some(a) = accel {
        builder = builder.accelerator(a);
    }
    builder.build(app)
}

fn build_menu(app: &AppHandle) -> tauri::Result<(Menu<Wry>, MenuItems)> {
    let mut reg = MenuItems::default();
    let r = &mut reg;
    let info = app.package_info();
    let about = AboutMetadata { name: Some(info.name.clone()), version: Some(info.version.to_string()), ..Default::default() };

    let app_menu = SubmenuBuilder::new(app, "Study Copilot")
        .about_with_text("Über Study Copilot", Some(about))
        .separator()
        .item(&cmd(app, r, "nav.settings", "Einstellungen …", Some("CmdOrCtrl+,"))?)
        .item(&cmd(app, r, "nav.claude", "Claude verbinden …", None)?)
        .separator()
        .services_with_text("Dienste")
        .separator()
        .hide_with_text("Study Copilot ausblenden")
        .hide_others_with_text("Andere ausblenden")
        .show_all_with_text("Alle einblenden")
        .separator()
        .quit_with_text("Study Copilot beenden")
        .build()?;

    let folder = SubmenuBuilder::new(app, "Datenordner")
        .item(&native(app, "show_folder", "Im Finder zeigen", None)?)
        .item(&native(app, "show_backups", "Backups zeigen", None)?)
        .separator()
        .item(&native(app, "change_folder", "Ordner wechseln …", None)?)
        .build()?;

    let file = SubmenuBuilder::new(app, "Ablage")
        .item(&cmd(app, r, "new.note", "Neue Sitzung …", Some("CmdOrCtrl+N"))?)
        .item(&cmd(app, r, "new.card", "Neue Karteikarte …", Some("CmdOrCtrl+Shift+N"))?)
        .item(&cmd(app, r, "new.event", "Neuer Termin …", Some("CmdOrCtrl+Alt+N"))?)
        .item(&cmd(app, r, "new.upload", "PDF hochladen …", Some("CmdOrCtrl+U"))?)
        .separator()
        .item(&cmd(app, r, "tab.open", "Öffnen …", Some("CmdOrCtrl+O"))?)
        .item(&cmd(app, r, "tab.openBeside", "Daneben öffnen …", Some("CmdOrCtrl+Alt+O"))?)
        .separator()
        .item(&cmd(app, r, "tab.close", "Tab schließen", Some("CmdOrCtrl+W"))?)
        .item(&cmd(app, r, "tab.reopen", "Geschlossenen Tab wieder öffnen", Some("CmdOrCtrl+Shift+T"))?)
        .separator()
        .item(&cmd(app, r, "page.save", "Sichern", Some("CmdOrCtrl+S"))?)
        .item(&native(app, "file.print", "Drucken …", Some("CmdOrCtrl+P"))?)
        .item(&cmd(app, r, "file.export", "Alle Daten exportieren …", None)?)
        .separator()
        .item(&folder)
        .build()?;

    let format = SubmenuBuilder::new(app, "Format")
        .item(&cmd(app, r, "format.bold", "Fett", Some("CmdOrCtrl+B"))?)
        .item(&cmd(app, r, "format.italic", "Kursiv", Some("CmdOrCtrl+I"))?)
        .item(&cmd(app, r, "format.code", "Code", Some("CmdOrCtrl+Alt+C"))?)
        .item(&cmd(app, r, "format.task", "Als Checkliste", Some("CmdOrCtrl+Shift+L"))?)
        .build()?;

    let edit = SubmenuBuilder::new(app, "Bearbeiten")
        .undo_with_text("Widerrufen")
        .redo_with_text("Wiederholen")
        .separator()
        .cut_with_text("Ausschneiden")
        .copy_with_text("Kopieren")
        .paste_with_text("Einsetzen")
        .select_all_with_text("Alles auswählen")
        .separator()
        .item(&cmd(app, r, "edit.find", "Suchen …", Some("CmdOrCtrl+F"))?)
        .item(&cmd(app, r, "search.focus", "Überall suchen …", Some("CmdOrCtrl+K"))?)
        .separator()
        .item(&format)
        .build()?;

    let view = SubmenuBuilder::new(app, "Darstellung")
        .item(&check(app, r, "view.sidebar", "Seitenleiste", Some("CmdOrCtrl+\\"))?)
        .item(&check(app, r, "view.split", "Geteilte Ansicht", Some("CmdOrCtrl+Shift+\\"))?)
        .item(&cmd(app, r, "view.swap", "Seiten tauschen", None)?)
        .item(&check(app, r, "view.focusLeft", "Linke Seite", Some("CmdOrCtrl+Alt+Left"))?)
        .item(&check(app, r, "view.focusRight", "Rechte Seite", Some("CmdOrCtrl+Alt+Right"))?)
        .separator()
        .item(&check(app, r, "view.theme", "Dunkles Design", Some("CmdOrCtrl+Shift+D"))?)
        .separator()
        .item(&native(app, "view.zoomIn", "Vergrößern", Some("CmdOrCtrl+="))?)
        .item(&native(app, "view.zoomOut", "Verkleinern", Some("CmdOrCtrl+-"))?)
        .item(&native(app, "view.zoomReset", "Originalgröße", Some("CmdOrCtrl+0"))?)
        .separator()
        .fullscreen_with_text("Vollbild")
        .build()?;

    let note = SubmenuBuilder::new(app, "Sitzung")
        .item(&check(app, r, "note.mode.edit", "Schreiben", Some("CmdOrCtrl+1"))?)
        .item(&check(app, r, "note.mode.read", "Lesen", Some("CmdOrCtrl+2"))?)
        .item(&check(app, r, "note.mode.recall", "Abfragen", Some("CmdOrCtrl+3"))?)
        .item(&cmd(app, r, "note.toggleEdit", "Schreiben / Lesen umschalten", Some("CmdOrCtrl+E"))?)
        .separator()
        .item(&cmd(app, r, "note.next", "Nächster Schritt", Some("CmdOrCtrl+Shift+Enter"))?)
        .item(&cmd(app, r, "note.summary", "Zusammenfassung schreiben", None)?)
        .item(&cmd(app, r, "note.cards", "Karteikarten aus Zeilen …", Some("CmdOrCtrl+Shift+K"))?)
        .separator()
        .item(&cmd(app, r, "note.insertLink", "PDF-Link einfügen …", Some("CmdOrCtrl+Alt+K"))?)
        .item(&cmd(app, r, "note.linkDoc", "Unterlage verknüpfen …", None)?)
        .item(&cmd(app, r, "note.copyMarkdown", "Als Markdown kopieren", Some("CmdOrCtrl+Alt+Shift+C"))?)
        .separator()
        .item(&cmd(app, r, "note.delete", "Sitzung löschen …", None)?)
        .build()?;

    let go = SubmenuBuilder::new(app, "Gehe zu")
        .item(&cmd(app, r, "nav.back", "Zurück", Some("CmdOrCtrl+["))?)
        .item(&cmd(app, r, "nav.forward", "Vor", Some("CmdOrCtrl+]"))?)
        .separator()
        .item(&cmd(app, r, "nav.home", "Übersicht", Some("CmdOrCtrl+Alt+1"))?)
        .item(&cmd(app, r, "nav.calendar", "Kalender", Some("CmdOrCtrl+Alt+2"))?)
        .item(&cmd(app, r, "nav.notes", "Sitzungen", Some("CmdOrCtrl+Alt+3"))?)
        .item(&cmd(app, r, "nav.review", "Lernbereich", Some("CmdOrCtrl+Alt+4"))?)
        .item(&cmd(app, r, "nav.flashcards", "Karteikarten", Some("CmdOrCtrl+Alt+5"))?)
        .item(&cmd(app, r, "nav.exams", "Probeklausuren", Some("CmdOrCtrl+Alt+6"))?)
        .item(&cmd(app, r, "nav.documents", "Unterlagen", Some("CmdOrCtrl+Alt+7"))?)
        .item(&cmd(app, r, "nav.modules", "Module", Some("CmdOrCtrl+Alt+8"))?)
        .item(&cmd(app, r, "nav.progress", "Fortschritt", Some("CmdOrCtrl+Alt+9"))?)
        .build()?;

    let study = SubmenuBuilder::new(app, "Lernen")
        .item(&cmd(app, r, "study.review", "Fällige Karten lernen", Some("CmdOrCtrl+L"))?)
        .item(&cmd(app, r, "study.cram", "Prüfungsmodus für dieses Modul", None)?)
        .separator()
        .item(&cmd(app, r, "plan.create", "Lernplan erstellen …", Some("CmdOrCtrl+Alt+L"))?)
        .item(&check(app, r, "focus.toggle", "Fokus-Timer starten / pausieren", Some("CmdOrCtrl+Alt+P"))?)
        .separator()
        .item(&cmd(app, r, "exam.new", "Probeklausur erstellen …", None)?)
        .build()?;

    let window = SubmenuBuilder::with_id(app, WINDOW_SUBMENU_ID, "Fenster")
        .minimize_with_text("Im Dock ablegen")
        .maximize_with_text("Zoomen")
        .separator()
        .item(&cmd(app, r, "tab.next", "Nächster Tab", Some("Ctrl+Tab"))?)
        .item(&cmd(app, r, "tab.prev", "Vorheriger Tab", Some("Ctrl+Shift+Tab"))?)
        .separator()
        .bring_all_to_front_with_text("Alle nach vorne bringen")
        .build()?;

    // macOS adds the search field for all menu items to the help menu.
    let help = SubmenuBuilder::with_id(app, HELP_SUBMENU_ID, "Hilfe")
        .item(&cmd(app, r, "palette.open", "Befehle …", Some("CmdOrCtrl+Shift+P"))?)
        .item(&cmd(app, r, "help.shortcuts", "Tastenkürzel", Some("CmdOrCtrl+/"))?)
        .build()?;

    let submenus: [&Submenu<Wry>; 9] = [&app_menu, &file, &edit, &view, &note, &go, &study, &window, &help];
    let menu = Menu::new(app)?;
    for m in submenus {
        menu.append(m)?;
    }
    Ok((menu, reg))
}

/// What the page reports: e = enabled, c = checked (command ids).
#[derive(Deserialize)]
struct MenuState {
    e: Vec<String>,
    c: Vec<String>,
}

fn apply_menu_state(app: &AppHandle, state: &MenuState) {
    // Clone the handles first: setting an item may wait for the main thread.
    let state_ref = app.state::<AppState>();
    let (items, checks) = {
        let reg = state_ref.menu.lock().unwrap();
        (reg.items.clone(), reg.checks.clone())
    };
    let has = |list: &[String], id: &str| list.iter().any(|x| x == id);
    for item in items {
        let _ = item.set_enabled(has(&state.e, item.id().as_ref()));
    }
    for item in checks {
        let id = item.id().as_ref().to_string();
        let _ = item.set_enabled(has(&state.e, &id));
        let _ = item.set_checked(has(&state.c, &id));
    }
}

// ---------------------------------------------------------------------------
// Focus timer in the menu bar (the Mac counterpart of a Live Activity)
// ---------------------------------------------------------------------------

const TRAY_ID: &str = "focus";

#[derive(Default)]
struct TrayTimer {
    /// Bumped on every push from the page; a counting thread of an older one stops.
    generation: u64,
    waker: Option<thread::Thread>,
}

/// `{"p":"focus"|"break"|"idle","e":end in ms since epoch or null,"l":ms left while paused}`
#[derive(Deserialize)]
struct FocusPush {
    p: String,
    e: Option<u64>,
    l: Option<u64>,
}

fn now_millis() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Whole minutes while more than a minute is left (one update per minute), then seconds.
fn tray_title(break_phase: bool, paused: bool, left_ms: u64) -> String {
    let icon = if paused { "⏸" } else if break_phase { "☕" } else { "🍅" };
    if left_ms > 60_000 {
        format!("{icon} {} min", left_ms.div_ceil(60_000))
    } else {
        let s = left_ms.div_ceil(1000);
        format!("{icon} {}:{:02}", s / 60, s % 60)
    }
}

/// Time until the title shows something different.
fn next_tray_update(left_ms: u64) -> Duration {
    let step = if left_ms > 60_000 { 60_000 } else { 1000 };
    let rest = left_ms % step;
    Duration::from_millis(if rest == 0 { step } else { rest } + 5)
}

fn apply_focus(app: &AppHandle, push: FocusPush) {
    let state = app.state::<AppState>();
    let generation = {
        let mut tray = state.tray.lock().unwrap();
        tray.generation += 1;
        if let Some(old) = tray.waker.take() {
            old.unpark();
        }
        tray.generation
    };
    if push.p != "focus" && push.p != "break" {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            handle.remove_tray_by_id(TRAY_ID);
        });
        return;
    }
    let break_phase = push.p == "break";
    let end = push.e;
    let paused = end.is_none();
    let left = |end: Option<u64>| end.map(|e| e.saturating_sub(now_millis())).unwrap_or(push.l.unwrap_or(0));

    let handle = app.clone();
    let title = tray_title(break_phase, paused, left(end));
    let _ = app.run_on_main_thread(move || {
        let toggle = MenuItemBuilder::with_id("tray_toggle", if paused { "Fortsetzen" } else { "Pausieren" }).build(&handle);
        let show = MenuItemBuilder::with_id("tray_show", "Study Copilot öffnen").build(&handle);
        let (Ok(toggle), Ok(show)) = (toggle, show) else { return };
        let Ok(menu) = Menu::with_items(&handle, &[&toggle, &show]) else { return };
        if let Some(tray) = handle.tray_by_id(TRAY_ID) {
            let _ = tray.set_menu(Some(menu));
            let _ = tray.set_title(Some(title));
        } else {
            let _ = TrayIconBuilder::with_id(TRAY_ID)
                .title(title)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "tray_toggle" => send_command(app, "focus.toggle"),
                    "tray_show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(&handle);
        }
    });
    let Some(end) = end else { return };

    // One wake-up per minute (per second in the last minute); parked in between and while paused.
    let counter = app.clone();
    let join = thread::spawn(move || loop {
        let left = end.saturating_sub(now_millis());
        if let Some(tray) = counter.tray_by_id(TRAY_ID) {
            let _ = tray.set_title(Some(tray_title(break_phase, false, left)));
        }
        if left == 0 {
            break;
        }
        thread::park_timeout(next_tray_update(left));
        if counter.state::<AppState>().tray.lock().unwrap().generation != generation {
            break;
        }
    });
    let mut tray = state.tray.lock().unwrap();
    if tray.generation == generation {
        tray.waker = Some(join.thread().clone());
    }
}

/// `studycopilot://localhost/menu?s={"e":[…],"c":[…]}` and `…/focus?s={…}` from the page.
fn menu_protocol(app: &AppHandle, request: &tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let uri = request.uri().to_string();
    let url = Url::parse(&uri).ok();
    let param = url.as_ref().and_then(|u| u.query_pairs().find(|(k, _)| k == "s").map(|(_, v)| v.into_owned()));
    let ok = match (url.as_ref().map(|u| u.path()), param) {
        (Some("/menu"), Some(s)) => serde_json::from_str::<MenuState>(&s).map(|state| apply_menu_state(app, &state)).is_ok(),
        (Some("/focus"), Some(s)) => serde_json::from_str::<FocusPush>(&s).map(|push| apply_focus(app, push)).is_ok(),
        _ => false,
    };
    tauri::http::Response::builder()
        .status(if ok { 204 } else { 400 })
        .header("Access-Control-Allow-Origin", "*")
        .body(Vec::new())
        .unwrap_or_default()
}

/// Runs a command of the web app (only ids from our own menu end up here).
fn send_command(app: &AppHandle, id: &str) {
    let Some(window) = app.get_webview_window("main") else { return };
    let detail = serde_json::to_string(id).unwrap_or_default();
    let _ = window.eval(format!("window.dispatchEvent(new CustomEvent('study:command',{{detail:{detail}}}))"));
}

const ZOOM_MIN: f64 = 0.6;
const ZOOM_MAX: f64 = 2.0;

fn set_zoom(app: &AppHandle, change: Option<f64>) {
    let mut config = load_config(app);
    let zoom = match change {
        Some(factor) => (config.zoom.unwrap_or(1.0) * factor).clamp(ZOOM_MIN, ZOOM_MAX),
        None => 1.0,
    };
    // Snap back to exactly 100 % on the way through.
    let zoom = if (zoom - 1.0).abs() < 0.03 { 1.0 } else { (zoom * 100.0).round() / 100.0 };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_zoom(zoom);
    }
    config.zoom = (zoom != 1.0).then_some(zoom);
    let _ = save_config(app, &config);
}

fn on_menu(app: &AppHandle, id: &str) {
    let dir = load_config(app).data_dir;
    match id {
        "show_folder" => {
            if let Some(dir) = dir {
                reveal(dir.display().to_string());
            }
        }
        "show_backups" => {
            if let Some(dir) = dir {
                let backups = dir.join("Backups");
                reveal(if backups.is_dir() { backups } else { dir }.display().to_string());
            }
        }
        "change_folder" => change_folder(app),
        "file.print" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.print();
            }
        }
        "view.zoomIn" => set_zoom(app, Some(1.1)),
        "view.zoomOut" => set_zoom(app, Some(1.0 / 1.1)),
        "view.zoomReset" => set_zoom(app, None),
        command if command.contains('.') => {
            // A radio item is ticked at once; the page confirms the state right after.
            if let Some(group) = RADIO_GROUPS.iter().find(|g| g.contains(&command)) {
                let checks = app.state::<AppState>().menu.lock().unwrap().checks.clone();
                for item in checks.iter().filter(|i| group.contains(&i.id().as_ref())) {
                    let _ = item.set_checked(item.id().as_ref() == command);
                }
            }
            send_command(app, command);
        }
        _ => {}
    }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

fn start_screen_url() -> Url {
    Url::parse("tauri://localhost/index.html").expect("valid url")
}

fn change_folder(app: &AppHandle) {
    let app = app.clone();
    thread::spawn(move || {
        stop_server(&app);
        let mut config = load_config(&app);
        config.data_dir = None;
        let _ = save_config(&app, &config);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.navigate(start_screen_url());
        }
    });
}

fn is_internal(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" | "data" | "blob" => true,
        "http" | "https" => matches!(url.host_str(), Some("127.0.0.1") | Some("localhost") | Some("tauri.localhost")),
        _ => false,
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![boot, use_folder, choose_folder, reveal])
        .register_uri_scheme_protocol("studycopilot", |ctx, request| menu_protocol(ctx.app_handle(), &request))
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .setup(|app| {
            let (menu, items) = build_menu(app.handle())?;
            *app.state::<AppState>().menu.lock().unwrap() = items;
            app.set_menu(menu)?;
            let zoom = load_config(app.handle()).zoom;
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned()
                .expect("main window config");
            let downloads = app.path().download_dir().ok();
            WebviewWindowBuilder::from_config(app.handle(), &config)?
                // Exports and PDFs land in ~/Downloads and are revealed in Finder.
                .on_download(move |_webview, event| {
                    match event {
                        DownloadEvent::Requested { destination, .. } => {
                            if let (Some(dir), Some(name)) = (&downloads, destination.file_name()) {
                                *destination = dir.join(name);
                            }
                        }
                        DownloadEvent::Finished { path: Some(path), success: true, .. } => {
                            let _ = Command::new("open").arg("-R").arg(path).status();
                        }
                        _ => {}
                    }
                    true
                })
                // External links open in the default browser.
                .on_navigation(|url| {
                    if is_internal(url) {
                        return true;
                    }
                    let _ = Command::new("open").arg(url.as_str()).status();
                    false
                })
                .build()?;
            if let (Some(zoom), Some(window)) = (zoom, app.get_webview_window("main")) {
                let _ = window.set_zoom(zoom);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the app");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            stop_server(handle);
        }
    });
}
