// The page is chosen by 维护工具/制作各终端版本.py through FADIAN_PAGE; the icon goes into the exe resources.
fn main() {
    println!("cargo:rerun-if-env-changed=FADIAN_PAGE");
    println!("cargo:rerun-if-env-changed=FADIAN_TITLE");
    println!("cargo:rerun-if-changed=app.rc");
    println!("cargo:rerun-if-changed=app.manifest");
    println!("cargo:rerun-if-changed=../应用图标/windows.ico");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        embed_resource::compile("app.rc", embed_resource::NONE).manifest_required().unwrap();
    }
}
