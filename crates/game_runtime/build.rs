use std::env;
use std::path::PathBuf;

fn main() {
    // 環境変数を取得（存在しない場合はデフォルト値）
    let github_sha = env::var("GITHUB_SHA")
        .unwrap_or_else(|_| "unknown".to_string());
    let github_run_id = env::var("GITHUB_RUN_ID")
        .unwrap_or_else(|_| "unknown".to_string());

    // Cargo.toml のバージョン情報を取得
    let version = env::var("CARGO_PKG_VERSION").unwrap();

    // 出力ディレクトリを取得
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let build_info_path = out_dir.join("build_info.rs");

    // Rust コードを生成
    let code = format!(
        r#"
/// ビルド情報を保持する構造体
#[derive(Debug, Clone)]
pub struct BuildInfo {{
    /// Git SHA (GITHUB_SHA)
    pub git_sha: &'static str,
    /// GitHub Actions Run ID
    pub run_id: &'static str,
    /// パッケージバージョン
    pub version: &'static str,
}}

impl BuildInfo {{
    /// ビルド情報を取得
    pub fn get() -> Self {{
        BuildInfo {{
            git_sha: "{}",
            run_id: "{}",
            version: "{}",
        }}
    }}

    /// デバッグ出力用の文字列表現
    pub fn to_string(&self) -> String {{
        format!(
            "BuildInfo {{{{ git_sha: {{}}, run_id: {{}}, version: {{}} }}}}",
            self.git_sha, self.run_id, self.version
        )
    }}
}}
"#,
        github_sha, github_run_id, version
    );

    std::fs::write(&build_info_path, code)
        .expect("Failed to write build_info.rs");

    // ビルドスクリプトの再実行トリガー
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    println!("cargo:rerun-if-env-changed=GITHUB_RUN_ID");
}