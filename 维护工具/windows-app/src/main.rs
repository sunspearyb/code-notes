//! 法典笔记 Windows 应用。
//!
//! The pure edition page is compiled into the exe and served from a fixed origin
//! (https://fadian.localhost on Windows), so browser storage survives upgrades.
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

static PAGE: &[u8] = include_bytes!(env!("FADIAN_PAGE"));
static ICON: &[u8] = include_bytes!("../../应用图标/android-legacy.png");

#[cfg(windows)]
const HOME: &str = "https://fadian.localhost/index.html";
#[cfg(not(windows))]
const HOME: &str = "fadian://localhost/index.html";

const BRIDGE: &str = r#"(() => {
  let next = 0; const waiting = {};
  window.__fadianReply = (id, ok, message) => { const w = waiting[id]; delete waiting[id]; if (w) (ok ? w[0] : w[1])(ok ? message : new Error(message)); };
  window.FadianShell = { saveText(name, text, type) { return new Promise((resolve, reject) => { const id = ++next; waiting[id] = [resolve, reject]; window.ipc.postMessage(JSON.stringify({ id, name, text })); }); } };
})();"#;

const SELFTEST: &str = r#"addEventListener('load', () => setTimeout(async () => {
  let report;
  try { report = 'page:' + !!document.querySelector('main .outline-page, main') + ' edition:' + serviceFreeEdition() + ' save:' + await window.FadianShell.saveText('自检/导出.txt', '法典笔记', 'text/plain'); }
  catch (error) { report = 'error:' + error.message; }
  window.ipc.postMessage(JSON.stringify({ selftest: report }));
}, 1500));"#;

enum UserEvent {
    Reply(u64, bool, String),
}

fn own_page(url: &str) -> bool {
    url.starts_with("https://fadian.localhost/") || url.starts_with("fadian://")
}

/// Save into Downloads\法典笔记 without overwriting an earlier export.
fn save(name: &str, text: &str) -> Result<String, String> {
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
        .with_background_color((246, 244, 238, 255))
        .with_clipboard(true)
        .with_initialization_script(BRIDGE)
        .with_custom_protocol("fadian".into(), |_id, request| {
            let found = matches!(request.uri().path(), "/" | "/index.html");
            Response::builder()
                .status(if found { 200 } else { 404 })
                .header(CONTENT_TYPE, if found { "text/html; charset=utf-8" } else { "text/plain" })
                .body(Cow::Borrowed(if found { PAGE } else { b"Not Found".as_slice() }))
                .unwrap()
        })
        .with_ipc_handler(move |request| {
            let message: serde_json::Value = serde_json::from_str(request.body()).unwrap_or_default();
            if let Some(report) = message["selftest"].as_str() {
                println!("{report}");
                std::process::exit(0);
            }
            let id = message["id"].as_u64().unwrap_or(0);
            let result = save(
                message["name"].as_str().unwrap_or(""),
                message["text"].as_str().unwrap_or(""),
            );
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

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(UserEvent::Reply(id, ok, text)) => {
                let text = serde_json::to_string(&text).unwrap();
                let _ = webview.evaluate_script(&format!("window.__fadianReply({id},{ok},{text})"));
            }
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
                *control_flow = ControlFlow::Exit
            }
            _ => {}
        }
    });
}
