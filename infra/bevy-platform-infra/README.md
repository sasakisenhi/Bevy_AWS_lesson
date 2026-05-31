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

## 注意事項

- 命名規則はリポジトリルートの `design.md` に定義しています。
- 命名規則テストは正規表現ベースで行いますが、OIDC の信頼条件（`aud` / `sub`）は厳密一致で検証します。
