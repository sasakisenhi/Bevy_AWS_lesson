use std::env;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    let sha = env::var("GITHUB_SHA").unwrap_or_else(|_| build_support::get_git_sha());
    let run_id = env::var("GITHUB_RUN_ID").unwrap_or_else(|_| build_support::local_run_id());

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let version = env::var("CARGO_PKG_VERSION").unwrap();

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is not set"));
    let info_path = out_dir.join("build_logic_info.rs");

    let code = build_support::generate_build_info_code("game_logic", &sha, &run_id, ts, &version);
    std::fs::write(&info_path, code).expect("Failed to write build_logic_info.rs");

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    println!("cargo:rerun-if-env-changed=GITHUB_RUN_ID");
}
