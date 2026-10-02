# bevy-platform-infra

AWS CDK（TypeScript）で Bevy プラットフォーム用のインフラを定義するパッケージです。

## 前提条件

- Node.js / npm が利用可能であること
- AWS 認証情報が設定済みであること
- **`CDK_DEFAULT_ACCOUNT` を必ず設定すること（必須）**

このリポジトリでは `account` 明示指定を運用ルールとしています。  
`CDK_DEFAULT_ACCOUNT` が未設定の場合は、デプロイ前（最低でも `cdk synth` 前）に fail-fast します。

## 環境変数

- `CDK_DEFAULT_ACCOUNT`: デプロイ対象 AWS アカウント ID（12 桁）
- `CDK_DEFAULT_REGION`: デプロイ対象リージョン（未指定時は `ap-northeast-1`）

## よく使うコマンド

- `npm run build` : TypeScript をコンパイル
- `npm run watch` : 変更監視しながらコンパイル
- `npm run test` : Jest ユニットテストを実行
- `npx cdk synth` : CloudFormation テンプレートを生成
- `npx cdk diff` : デプロイ済みとの差分を確認
- `npx cdk deploy` : スタックをデプロイ

## 新しい AWS アカウントへの初回デプロイ

GitHub CLI を初回のみ認証した後、リポジトリルートで AWS CLI の対話認証と bootstrap スクリプトを実行します。AWS profile は、認証済みで CDK bootstrap / deploy と構築結果の検証に必要な権限を持つ管理用 profile を指定します。通常作業に root user は使用しません。

```bash
gh auth login
aws login --profile <admin-profile>

./script/bootstrap-aws-account.sh \
  --profile <admin-profile> \
  --dry-run

./script/bootstrap-aws-account.sh \
  --profile <admin-profile>
```

最初に `--dry-run` で対象 AWS account、repository、branch、CDK environment と実行予定を確認します。dry-run は AWS、GitHub、依存関係を変更しません。

スクリプトは AWS Account ID と GitHub repository/default branch を自動解決し、`ap-northeast-1` と `us-east-1` の CDK bootstrap、セカンダリ・プライマリスタックのデプロイ、GitHub repository variables と `AWS_ROLE_ARN` secret の設定、AWS / GitHub 両方の構築結果の検証まで行います。GitHub Actions 用 IAM OIDC Provider はプライマリスタックの `AWS::IAM::OIDCProvider` として作成されるため、AWS Console で事前作成する必要はありません。

AWS Access Key / Secret Access Key の作成は標準手順に含めません。GitHub-hosted runner 上の workflow は GitHub OIDC で IAM Role を引き受け、一時認証情報を使用します。2026-10-02 に、この bootstrap / recovery 手順と [GitHub Actions run #66（ID: 37017781536）](https://github.com/sasakisenhi/Bevy_AWS_lesson/actions/runs/37017781536) の CDK diff / deploy を実 AWS 環境で確認済みです。

## Phase 1 での CodeBuild の扱い

CDK は将来の移行に備えた CodeBuild 用 IAM service role を作成しますが、CodeBuild project は定義していません。現行 workflow は CodeBuild `StartBuild` を呼び出さず、Windows Release build は GitHub-hosted runner と `cargo-xwin` で実行します。

## 注意事項

- 命名規則はリポジトリルートの `design.md` に定義しています。
- 命名規則テストは正規表現ベースで行いますが、OIDC の信頼条件（`aud` / `sub`）は厳密一致で検証します。
