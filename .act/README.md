# act で GitHub Actions をローカル再現する手順

このディレクトリは `nektos/act` で主要な GitHub Actions workflow をローカル再現するための補助ファイルです。

## 対象 workflow

- `app-ci-job.yml`
  - Rust のアプリ CI
- `infra-ci.yml`
  - インフラ test / deploy
- `artifact.yml`
  - S3 artifact freeze

## 含まれるファイル

- `infra-ci-deploy.event.json`
  - `infra-ci.yml` の `workflow_dispatch` 用イベント payload
  - `run_deploy=true` を含みます
- `artifact.event.json`
  - `artifact.yml` の `workflow_dispatch` 用イベント payload
- `infra-ci.vars`
  - GitHub Actions の `vars.*` 相当
- `infra-ci.secrets.example`
  - GitHub Actions の `secrets.*` 相当の雛形
- `infra-ci.env.example`
  - `act` コンテナへ渡すローカル AWS 認証情報の雛形
- `../.actrc`
  - `ubuntu-latest` 用の既定 runner image 設定
- `../script/act-app-ci.sh`
  - app CI 用ラッパー
- `../script/act-infra-test.sh`
  - infra test 用ラッパー
- `../script/act-infra-deploy.sh`
  - infra deploy 用ラッパー
- `../script/act-artifact-freeze.sh`
  - artifact freeze 用ラッパー

## 事前準備

1. `AWS_ROLE_ARN` を確認する
2. 雛形をコピーする

```text
cp .act/infra-ci.secrets.example .act/infra-ci.secrets.local
cp .act/infra-ci.env.example .act/infra-ci.env.local
```

3. `.act/infra-ci.secrets.local` の `AWS_ROLE_ARN=` を実際の値に置き換える
4. `.act/infra-ci.env.local` にローカル AWS 認証情報を設定する

`act` は GitHub Hosted Runner の OIDC 発行環境そのものではないため、
`aws-actions/configure-aws-credentials@v4` をローカルで動かす際は、
AssumeRole の元になる AWS 認証情報を `--env-file` でコンテナへ渡すのが安全です。

## AWS_ROLE_ARN の考え方

この値は `aws-actions/configure-aws-credentials@v4` が Assume する IAM ロール ARN です。
このリポジトリでは通常、`BevyPlatformInfraStack` が作成した GitHub Actions 用ロール ARN を指定します。

形式例:

```text
arn:aws:iam::774786166706:role/BevyPlatformInfraStack-GithubActionsRoleF5CC769F-xxxxxxxxxxxx
```

ロール名の末尾サフィックスは環境ごとに異なるため、実際の ARN を AWS 側で確認して設定してください。

確認方法の例:

```text
aws cloudformation describe-stacks \
  --region ap-northeast-1 \
  --stack-name BevyPlatformInfraStack \
  --query "Stacks[0].Outputs[?OutputKey=='GithubActionsRoleArn'].OutputValue" \
  --output text
```

もしセッション切れで取得できない場合は、先に `aws login` を行ってから再実行してください。

## 実行例

### app CI

```text
./script/act-app-ci.sh
```

### infra test

```text
./script/act-infra-test.sh
```

### infra deploy

```text
./script/act-infra-deploy.sh
```

事前にコマンドだけ確認したい場合:

```text
./script/act-infra-deploy.sh --dry-run
```

### artifact freeze

```text
./script/act-artifact-freeze.sh
```

事前にコマンドだけ確認したい場合:

```text
./script/act-artifact-freeze.sh --dry-run
```

## 補足

- `infra-ci.yml` / `artifact.yml` の `github.event.repository.name` や `github.ref_name` を満たすため、`-e` で event payload を渡しています。
- `S3_BUCKET` は将来の artifact 系検証用メモとして入れていますが、`infra-deploy` 自体は直接参照していません。
- `infra-deploy` と `artifact-freeze` を `act` で回すときは、GitHub OIDC の代替として `.act/infra-ci.env.local` の AWS 認証情報が必要になる場合があります。
- ラッパースクリプトは `.local` ファイル未作成時に即座に失敗するため、`act` の長いエラーに入る前に前提不足へ気づけます。
- Docker 権限が必要です。`docker ps` が通る状態で `act` を実行してください。
