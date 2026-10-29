//! 法典笔记应用（Windows 与 Mac）。
//!
//! The pages of every data pack (宪法、民法典、网络法典 …) are compiled into the app and served from one
//! fixed origin (https://fadian.localhost on Windows, fadian://localhost on Mac), so browser storage
//! survives upgrades. Each code keeps its notes under its own storage key, so they never mix; the page's
//! 切换法典 simply opens the other page. Apps made earlier for a single code used the same origin and
//! storage folder, so their notes appear here unchanged.
//! WebView2 keeps that storage under %LOCALAPPDATA%\FadianNotes, which the
//! uninstaller leaves alone. Exports go to Downloads\法典笔记 through
//! window.FadianShell.saveText; there is no local service in this edition.
#![windows_subsystem = "windows"]

use std::{borrow::Cow, fs, path::PathBuf};
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    window::{Icon, WindowBuilder},
};
use wry::{
    http::{header::CONTENT_TYPE, Response},
    NewWindowResponse, WebContext, WebViewBuilder,
};

include!(concat!(env!("OUT_DIR"), "/pages.rs"));
static ICON: &[u8] = include_bytes!("../../应用图标/android-legacy.png");

#[cfg(windows)]
const HOME: &str = "https://fadian.localhost/index.html";
#[cfg(not(windows))]
const HOME: &str = "fadian://localhost/index.html";

const BRIDGE: &str = r#"(() => {
  let next = 0; const waiting = {};
  window.__fadianReply = (id, ok, message) => { const w = waiting[id]; delete waiting[id]; if (w) (ok ? w[0] : w[1])(ok ? message : new Error(message)); };
  const send = body => new Promise((resolve, reject) => { const id = ++next; waiting[id] = [resolve, reject]; window.ipc.postMessage(JSON.stringify({ id, ...body })); });
  window.FadianShell = { edition: '@EDITION@', saveText(name, text, type) { return send({ name, text }); }, saveBytes(name, base64) { return send({ name, base64 }); } };
})();"#;

const SELFTEST: &str = r#"addEventListener('load', () => setTimeout(async () => {
  let report;
  // stored: reports what an earlier self-test left in localStorage, to check that notes survive a restart.
  try { const before = localStorage.getItem('fadian-selftest'); localStorage.setItem('fadian-selftest', String(Date.now()));
        report = 'page:' + !!document.querySelector('main .outline-page, main') + ' edition:' + serviceFreeEdition() + ' codes:' + (DATA.codes || []).length + ' stored:' + !!before + ' save:' + await window.FadianShell.saveText('自检/导出.txt', '法典笔记', 'text/plain'); }
  catch (error) { report = 'error:' + error.message; }
  window.ipc.postMessage(JSON.stringify({ selftest: report }));
}, 1500));"#;

enum UserEvent {
    Reply(u64, bool, String),
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    Menu(String),
}

/// The page for a request path: / and /index.html are the default code; others by file name.
fn page_for(path: &str) -> Option<&'static [u8]> {
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&path[i + 1..i + 3], 16) {
                decoded.push(b);
                i += 3;
                continue;
            }
        }
        decoded.push(bytes[i]);
        i += 1;
    }
    let name = String::from_utf8(decoded).ok()?;
    let name = name.trim_start_matches('/');
    if name.is_empty() || name == "index.html" {
        return Some(PAGES[0].1);
    }
    PAGES.iter().find(|(n, _)| *n == name).map(|(_, page)| *page)
}

fn own_page(url: &str) -> bool {
    url.starts_with("https://fadian.localhost/") || url.starts_with("fadian://")
}

/// Save into Downloads\法典笔记 without overwriting an earlier export.
fn save(name: &str, text: &[u8]) -> Result<String, String> {
    let clean: String = name
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) || c.is_control() { '_' } else { c })
        .collect();
    let clean = clean.trim().trim_start_matches('.');
    let clean = if clean.is_empty() { "法典笔记导出.txt" } else { clean };
    let dir = match std::env::var_os("FADIAN_SELFTEST") {
        Some(dir) => PathBuf::from(dir),
        None => dirs::download_dir()
            .or_else(dirs::home_dir)
            .ok_or("找不到“下载”文件夹")?
            .join("法典笔记"),
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let (stem, ext) = match clean.rfind('.') {
        Some(i) if i > 0 => (&clean[..i], &clean[i..]),
        _ => (clean, ""),
    };
    let mut path = dir.join(clean);
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(format!(
        "已保存到“下载/法典笔记”文件夹：{}",
        path.file_name().unwrap().to_string_lossy()
    ))
}

fn window_icon() -> Option<Icon> {
    let mut reader = png::Decoder::new(ICON).read_info().ok()?;
    let mut buffer = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buffer).ok()?;
    if info.color_type != png::ColorType::Rgba {
        return None;
    }
    buffer.truncate(info.buffer_size());
    Icon::from_rgba(buffer, info.width, info.height).ok()
}

fn main() -> wry::Result<()> {
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    // On a Mac, Copy and Paste need an Edit menu; the View menu zooms the page as a browser does.
    #[cfg(target_os = "macos")]
    let _menu = mac_menu(proxy.clone());
    let window = WindowBuilder::new()
        // FADIAN_TITLE names the app of another data pack (法典笔记 · 民法典); its notes use their own
        // browser record, so all packs can share the FadianNotes storage folder.
        .with_title(option_env!("FADIAN_TITLE").unwrap_or("法典笔记"))
        .with_inner_size(LogicalSize::new(1280.0, 860.0))
        .with_min_inner_size(LogicalSize::new(380.0, 560.0))
        .with_window_icon(window_icon())
        .build(&event_loop)
        .expect("无法创建窗口");

    let data = dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("FadianNotes");
    let mut context = WebContext::new(Some(data));
    let builder = WebViewBuilder::new_with_web_context(&mut context)
        .with_background_color((250, 248, 240, 255))
        .with_clipboard(true)
        .with_initialization_script(&BRIDGE.replace("@EDITION@", if cfg!(target_os = "macos") { "Mac 版" } else { "Windows 版" }))
        .with_custom_protocol("fadian".into(), |_id, request| {
            let page = page_for(request.uri().path());
            Response::builder()
                .status(if page.is_some() { 200 } else { 404 })
                .header(CONTENT_TYPE, if page.is_some() { "text/html; charset=utf-8" } else { "text/plain" })
                .body(Cow::Borrowed(page.unwrap_or(b"Not Found".as_slice())))
                .unwrap()
        })
        .with_ipc_handler(move |request| {
            let message: serde_json::Value = serde_json::from_str(request.body()).unwrap_or_default();
            if let Some(report) = message["selftest"].as_str() {
                println!("{report}");
                std::process::exit(0);
            }
            let id = message["id"].as_u64().unwrap_or(0);
            let name = message["name"].as_str().unwrap_or("");
            let result = match message["base64"].as_str() {
                Some(data) => base64(data).and_then(|bytes| save(name, &bytes)),
                None => save(name, message["text"].as_str().unwrap_or("").as_bytes()),
            };
            let (ok, text) = match result {
                Ok(text) => (true, text),
                Err(error) => (false, error),
            };
            let _ = proxy.send_event(UserEvent::Reply(id, ok, text));
        })
        .with_navigation_handler(|url| {
            if own_page(&url) {
                return true;
            }
            let _ = open::that_detached(&url);
            false
        })
        .with_new_window_req_handler(|url, _features| {
            if !own_page(&url) {
                let _ = open::that_detached(&url);
            }
            NewWindowResponse::Deny
        })
        .with_url(HOME);

    #[cfg(windows)]
    let builder = {
        use wry::WebViewBuilderExtWindows;
        builder.with_https_scheme(true)
    };
    // FADIAN_SELFTEST=<folder>: check that the page starts and an export is saved there, then quit.
    let builder = if std::env::var_os("FADIAN_SELFTEST").is_some() {
        builder.with_initialization_script(SELFTEST)
    } else {
        builder
    };
    let webview = builder.build(&window)?;
    #[cfg(target_os = "macos")]
    if let Some(z) = fs::read_to_string(zoom_file()).ok().and_then(|t| t.trim().parse::<f64>().ok()).filter(|z| (0.5..=3.0).contains(z)) {
        let _ = webview.zoom(z);
    }

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(UserEvent::Reply(id, ok, text)) => {
                let text = serde_json::to_string(&text).unwrap();
                let _ = webview.evaluate_script(&format!("window.__fadianReply({id},{ok},{text})"));
            }
            #[cfg(target_os = "macos")]
            Event::UserEvent(UserEvent::Menu(id)) => {
                let file = zoom_file();
                let now: f64 = fs::read_to_string(&file).ok().and_then(|t| t.trim().parse().ok()).unwrap_or(1.0);
                const STEPS: [f64; 13] = [0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
                let next = match id.as_str() {
                    "zoom-in" => STEPS.iter().copied().find(|z| *z > now + 0.001).unwrap_or(3.0),
                    "zoom-out" => STEPS.iter().rev().copied().find(|z| *z < now - 0.001).unwrap_or(0.5),
                    "zoom-reset" => 1.0,
                    _ => now,
                };
                let _ = webview.zoom(next);
                if let Some(dir) = file.parent() {
                    let _ = fs::create_dir_all(dir);
                }
                let _ = fs::write(&file, next.to_string());
            }
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
                *control_flow = ControlFlow::Exit
            }
            _ => {}
        }
    });
}

#[cfg(target_os = "macos")]
fn zoom_file() -> PathBuf {
    dirs::data_dir().unwrap_or_else(std::env::temp_dir).join("FadianNotes").join("zoom")
}

#[cfg(target_os = "macos")]
fn mac_menu(proxy: tao::event_loop::EventLoopProxy<UserEvent>) -> muda::Menu {
    use muda::{accelerator::{Accelerator, Code, Modifiers}, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
    let menu = Menu::new();
    let key = |code| Some(Accelerator::new(Some(Modifiers::META), code));
    let app = Submenu::with_items("法典笔记", true, &[&PredefinedMenuItem::about(Some("关于法典笔记"), None), &PredefinedMenuItem::separator(), &PredefinedMenuItem::hide(Some("隐藏法典笔记")), &PredefinedMenuItem::hide_others(Some("隐藏其他")), &PredefinedMenuItem::show_all(Some("全部显示")), &PredefinedMenuItem::separator(), &PredefinedMenuItem::quit(Some("退出法典笔记"))]).unwrap();
    let edit = Submenu::with_items("编辑", true, &[&PredefinedMenuItem::undo(Some("撤销")), &PredefinedMenuItem::redo(Some("重做")), &PredefinedMenuItem::separator(), &PredefinedMenuItem::cut(Some("剪切")), &PredefinedMenuItem::copy(Some("拷贝")), &PredefinedMenuItem::paste(Some("粘贴")), &PredefinedMenuItem::select_all(Some("全选"))]).unwrap();
    let view = Submenu::with_items("显示", true, &[&MenuItem::with_id("zoom-in", "放大", true, key(Code::Equal)), &MenuItem::with_id("zoom-out", "缩小", true, key(Code::Minus)), &MenuItem::with_id("zoom-reset", "实际大小", true, key(Code::Digit0)), &PredefinedMenuItem::separator(), &PredefinedMenuItem::fullscreen(Some("进入全屏幕"))]).unwrap();
    let window = Submenu::with_items("窗口", true, &[&PredefinedMenuItem::minimize(Some("最小化")), &PredefinedMenuItem::maximize(Some("缩放"))]).unwrap();
    menu.append_items(&[&app, &edit, &view, &window]).unwrap();
    menu.init_for_nsapp();
    MenuEvent::set_event_handler(Some(move |event: MenuEvent| { let _ = proxy.send_event(UserEvent::Menu(event.id.0)); }));
    menu
}

/// Attachments come from the page as base64 (saveBytes).
fn base64(text: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(text.len() * 3 / 4);
    let (mut buffer, mut bits) = (0u32, 0);
    for c in text.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=') {
        let value = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return Err("文件内容无效".into()),
        } as u32;
        buffer = buffer << 6 | value;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
        }
    }
    Ok(out)
}
