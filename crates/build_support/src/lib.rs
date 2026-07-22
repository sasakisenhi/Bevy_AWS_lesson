//! ビルド成果物の由来情報を生成するbuild script用ヘルパー。

use std::env;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// 現在のcrateディレクトリで解決できるGit SHAを返す。
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

/// CI外のビルドにも追跡用IDを持たせる。
pub fn local_run_id() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("local-{}", secs)
}

/// 各crateに埋め込む由来情報のRustコードを生成する。
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
#[derive(Debug, Clone)]
pub struct BuildInfo {{
    pub crate_label: &'static str,
    pub git_sha: &'static str,
    pub ci_run_id: &'static str,
    pub build_timestamp: &'static str,
    pub version: &'static str,
}}

impl BuildInfo {{
    pub fn get() -> Self {{
        BuildInfo {{
            crate_label: "{crate_label}",
            git_sha: "{sha}",
            ci_run_id: "{run_id}",
            build_timestamp: "{ts}",
            version: "{version}",
        }}
    }}

    pub fn to_json(&self) -> String {{
        format!(
            r#"{{{{crate_label:{{}},git_sha:{{}},ci_run_id:{{}},build_timestamp:{{}},version:{{}}}}}}"#,
            self.crate_label, self.git_sha, self.ci_run_id, self.build_timestamp, self.version
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

/// 明示的なcrate別SHA、CIのSHA、ローカルGitの順に由来情報を解決する。
pub fn get_git_sha_with_fallback(primary_var: &str) -> String {
    env::var(primary_var)
        .or_else(|_| env::var("GITHUB_SHA"))
        .unwrap_or_else(|_| get_git_sha())
}

/// 実行体がどのcore/logic/runtimeから作られたかを一点に集約する。
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
#[derive(Debug, Clone)]
pub struct BuildManifest {{
    pub core_git_sha: &'static str,
    pub logic_git_sha: &'static str,
    pub runtime_git_sha: &'static str,
    pub ci_run_id: &'static str,
    pub build_timestamp: &'static str,
}}

impl BuildManifest {{
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
