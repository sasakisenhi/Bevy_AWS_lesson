use std::env;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    // 由来情報（core / logic / runtime）を環境変数 → CI → ローカルgit の順でフォールバック
    let core_git_sha = build_support::get_git_sha_with_fallback("CORE_GIT_SHA");
    let logic_git_sha = build_support::get_git_sha_with_fallback("LOGIC_GIT_SHA");
    let runtime_git_sha = build_support::get_git_sha_with_fallback("RUNTIME_GIT_SHA");

    // CI Run ID は未設定ならローカル生成
    let ci_run_id = env::var("GITHUB_RUN_ID").unwrap_or_else(|_| build_support::local_run_id());

    // ビルド時刻（UNIX秒）
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // 出力先ファイル（ビルド生成コード）
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is not set"));
    let manifest_path = out_dir.join("build_manifest.rs");

    // 生成する Rust コード
    let code = build_support::generate_build_manifest_code(
        &core_git_sha,
        &logic_git_sha,
        &runtime_git_sha,
        &ci_run_id,
        ts,
    );

    std::fs::write(&manifest_path, code).expect("Failed to write build_manifest.rs");

    // 再ビルドトリガ
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=CORE_GIT_SHA");
    println!("cargo:rerun-if-env-changed=LOGIC_GIT_SHA");
    println!("cargo:rerun-if-env-changed=RUNTIME_GIT_SHA");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    println!("cargo:rerun-if-env-changed=GITHUB_RUN_ID");
}
