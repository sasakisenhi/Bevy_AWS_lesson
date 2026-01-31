//! ビルドスクリプト用の共通ヘルパー

use std::env;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// ローカル git から現在のコミット SHA を取得
pub fn get_git_sha() -> String {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    match Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(manifest_dir)
        .output()
    {
        Ok(output) if output.status.success() => String::from_utf8(output.stdout)
            .ok()
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        _ => "unknown".to_string(),
    }
}

/// ローカル用の擬似 Run ID を生成（local-<UNIX秒>）
pub fn local_run_id() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("local-{}", secs)
}

/// BuildInfo の Rust コードを生成
pub fn generate_build_info_code(
    crate_label: &str,
    sha: &str,
    run_id: &str,
    ts_secs: u64,
    version: &str,
) -> String {
    let ts = ts_secs.to_string();
    format!(
        r##"
/// ビルド情報（{crate_label}）
#[derive(Debug, Clone)]
pub struct BuildInfo {{
    /// Git SHA
    pub git_sha: &'static str,
    /// GitHub Actions Run ID
    pub ci_run_id: &'static str,
    /// ビルド時刻（UNIX秒）
    pub build_timestamp: &'static str,
    /// パッケージバージョン
    pub version: &'static str,
}}

impl BuildInfo {{
    /// ビルド情報を取得
    pub fn get() -> Self {{
        BuildInfo {{
            git_sha: "{sha}",
            ci_run_id: "{run_id}",
            build_timestamp: "{ts}",
            version: "{version}",
        }}
    }}

    /// JSON 文字列として返す
    pub fn to_json(&self) -> String {{
        format!(
            r#"{{{{git_sha:{{}},ci_run_id:{{}},build_timestamp:{{}},version:{{}}}}}}"#,
            self.git_sha, self.ci_run_id, self.build_timestamp, self.version
        )
    }}
}}
"##,
        crate_label = crate_label,
        sha = sha,
        run_id = run_id,
        ts = ts,
        version = version
    )
}

pub fn get_git_sha_with_fallback(primary_var: &str) -> String {
    env::var(primary_var)
        .or_else(|_| env::var("GITHUB_SHA"))
        .unwrap_or_else(|_| get_git_sha())
}

pub fn generate_build_manifest_code(
    core_sha: &str,
    logic_sha: &str,
    runtime_sha: &str,
    run_id: &str,
    ts_secs: u64,
) -> String {
    let ts = ts_secs.to_string();
    format!(
        r##"
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
"##,
        core = core_sha,
        logic = logic_sha,
        runtime = runtime_sha,
        run_id = run_id,
        ts = ts
    )
}
