use std::env;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    let logic_git_sha = env::var("GITHUB_SHA").unwrap_or_else(|_| get_git_sha());

    let ci_run_id = env::var("GITHUB_RUN_ID").unwrap_or_else(|_| local_run_id());

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let build_timestamp = ts.to_string();

    let version = env::var("CARGO_PKG_VERSION").unwrap();

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is not set"));
    let info_path = out_dir.join("build_logic_info.rs");

    let code = format!(
        r##"
/// ビルド情報（game_logic）
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
            r#"{{"git_sha":"{{}}","ci_run_id":"{{}}","build_timestamp":"{{}}","version":"{{}}"}}"#,
            self.git_sha, self.ci_run_id, self.build_timestamp, self.version
        )
    }}
}}
"##,
        sha = logic_git_sha,
        run_id = ci_run_id,
        ts = build_timestamp,
        version = version
    );

    std::fs::write(&info_path, code).expect("Failed to write build_logic_info.rs");

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    println!("cargo:rerun-if-env-changed=GITHUB_RUN_ID");
}

fn get_git_sha() -> String {
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

fn local_run_id() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("local-{}", secs)
}
