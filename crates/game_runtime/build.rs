use std::env;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    // 由来情報（core / logic / runtime）を環境変数 → CI → ローカルgit の順でフォールバック
    let core_git_sha = get_git_sha_with_fallback("CORE_GIT_SHA");
    let logic_git_sha = get_git_sha_with_fallback("LOGIC_GIT_SHA");
    let runtime_git_sha = get_git_sha_with_fallback("RUNTIME_GIT_SHA");

    // CI Run ID は未設定ならローカル生成
    let ci_run_id = env::var("GITHUB_RUN_ID").unwrap_or_else(|_| local_run_id());

    // ビルド時刻（UNIX秒）
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let build_timestamp = ts.to_string();

    // 出力先ファイル（ビルド生成コード）
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is not set"));
    let manifest_path = out_dir.join("build_manifest.rs");

    // 生成する Rust コード
    let code = format!(
        r#"
/// 実行体の由来情報（責任の一点集約）
#[derive(Debug, Clone)]
pub struct BuildManifest {{
    /// game_core の Git SHA
    pub core_git_sha: &'static str,
    /// game_logic の Git SHA
    pub logic_git_sha: &'static str,
    /// game_runtime（自身）の Git SHA
    pub runtime_git_sha: &'static str,
    /// GitHub Actions Run ID（CI の同一性）
    pub ci_run_id: &'static str,
    /// ビルド時刻（UNIX秒）
    pub build_timestamp: &'static str,
}}

impl BuildManifest {{
    /// マニフェストを取得
    pub fn get() -> Self {{
        BuildManifest {{
            core_git_sha: "{core}",
            logic_git_sha: "{logic}",
            runtime_git_sha: "{runtime}",
            ci_run_id: "{run_id}",
            build_timestamp: "{ts}",
        }}
    }}
}}

impl std::fmt::Display for BuildManifest {{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {{
        write!(
            f,
            "BuildManifest {{{{ core_git_sha: {{}}, logic_git_sha: {{}}, runtime_git_sha: {{}}, ci_run_id: {{}}, build_timestamp: {{}} }}}}",
            self.core_git_sha,
            self.logic_git_sha,
            self.runtime_git_sha,
            self.ci_run_id,
            self.build_timestamp
        )
    }}
}}
"#,
        core = core_git_sha,
        logic = logic_git_sha,
        runtime = runtime_git_sha,
        run_id = ci_run_id,
        ts = build_timestamp
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

/// 環境変数からGit SHAを取得（GITHUB_SHA へフォールバック、最終的にローカルgit）
fn get_git_sha_with_fallback(primary_var: &str) -> String {
    env::var(primary_var)
        .or_else(|_| env::var("GITHUB_SHA"))
        .unwrap_or_else(|_| get_git_sha())
}

/// ローカルの git SHA を取得（失敗時は "unknown"）
fn get_git_sha() -> String {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    match Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(manifest_dir)
        .output()
    {
        Ok(output) if output.status.success() => {
            String::from_utf8(output.stdout)
                .ok()
                .map(|s| s.trim().to_string())
                .unwrap_or_else(|| "unknown".to_string())
        }
        _ => "unknown".to_string(),
    }
}

/// ローカル用の擬似 Run ID を生成（local-<UNIX秒>）
fn local_run_id() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("local-{}", secs)
}
