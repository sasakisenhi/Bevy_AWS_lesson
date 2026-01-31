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
