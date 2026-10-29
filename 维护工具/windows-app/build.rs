// The pages are chosen by 维护工具/制作各终端版本.py through FADIAN_PAGES, a folder holding one page per
// data pack (法典笔记.html first, then 法典笔记-<名称>.html); they are compiled into the app. FADIAN_PAGE
// (one page) is still accepted. The icon goes into the exe resources on Windows.
use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-env-changed=FADIAN_PAGES");
    println!("cargo:rerun-if-env-changed=FADIAN_PAGE");
    println!("cargo:rerun-if-env-changed=FADIAN_TITLE");
    println!("cargo:rerun-if-changed=app.rc");
    println!("cargo:rerun-if-changed=app.manifest");
    println!("cargo:rerun-if-changed=../应用图标/windows.ico");
    let mut pages: Vec<PathBuf> = match (env::var_os("FADIAN_PAGES"), env::var_os("FADIAN_PAGE")) {
        (Some(dir), _) => fs::read_dir(&dir).expect("FADIAN_PAGES 不是文件夹").filter_map(|e| e.ok()).map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|x| x == "html") && p.file_name().unwrap().to_string_lossy().starts_with("法典笔记")).collect(),
        (None, Some(page)) => vec![PathBuf::from(page)],
        _ => panic!("请用 FADIAN_PAGES 指定页面文件夹"),
    };
    // 法典笔记.html (the default pack) first; the others by name.
    pages.sort_by_key(|p| { let n = p.file_name().unwrap().to_string_lossy().into_owned(); (n != "法典笔记.html", n) });
    assert!(!pages.is_empty(), "没有找到页面");
    let entries: String = pages.iter().map(|p| {
        let name = if env::var_os("FADIAN_PAGES").is_some() { p.file_name().unwrap().to_string_lossy().into_owned() } else { "法典笔记.html".into() };
        println!("cargo:rerun-if-changed={}", p.display());
        format!("    ({name:?}, include_bytes!({:?})),\n", fs::canonicalize(p).unwrap())
    }).collect();
    let out = PathBuf::from(env::var("OUT_DIR").unwrap()).join("pages.rs");
    fs::write(out, format!("static PAGES: &[(&str, &[u8])] = &[\n{entries}];\n")).unwrap();
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        embed_resource::compile("app.rc", embed_resource::NONE).manifest_required().unwrap();
    }
}
