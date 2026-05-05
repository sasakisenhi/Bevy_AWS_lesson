Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# --- 設定 ---
$BUCKET_NAME = "bevy-aws-test" # あなたのバケット名
$LOCAL_DIR = "./latest_build"
$STAGING_POINTER = "s3://$BUCKET_NAME/tags/staging_latest.txt"

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "aws CLI が見つかりません。インストールと PATH 設定を確認してください。"
}

# 1. 保存用ディレクトリの作成
if (-not (Test-Path $LOCAL_DIR)) {
    New-Item -ItemType Directory -Path $LOCAL_DIR | Out-Null
}

# 2. S3から「最新のSHA」を取得
Write-Host "Checking for latest build..." -ForegroundColor Cyan
$LATEST_SHA = aws s3 cp $STAGING_POINTER - | Out-String
if ($LASTEXITCODE -ne 0) {
    throw "最新SHAの取得に失敗しました: $STAGING_POINTER"
}
$LATEST_SHA = $LATEST_SHA.Trim()

if ([string]::IsNullOrWhiteSpace($LATEST_SHA)) {
    throw "最新SHAが空です。staging_latest.txt の内容を確認してください。"
}

if ($LATEST_SHA -notmatch '^[0-9a-fA-F]{40}$') {
    throw "最新SHAの形式が不正です: $LATEST_SHA"
}

# 3. 現在手元にあるSHAを確認（簡易的な管理ファイル）
$CURRENT_SHA_FILE = "$LOCAL_DIR/current_sha.txt"
$CURRENT_SHA = ""
if (Test-Path $CURRENT_SHA_FILE) {
    $CURRENT_SHA = (Get-Content $CURRENT_SHA_FILE -Raw).Trim()
}

# 4. 比較とダウンロード
if ($LATEST_SHA -eq $CURRENT_SHA) {
    Write-Host "Already up to date! (SHA: $LATEST_SHA)" -ForegroundColor Green
}
else {
    Write-Host "New build found: $LATEST_SHA. Downloading..." -ForegroundColor Yellow
    
    # 指定したSHAのディレクトリを丸ごと同期
    $S3_PATH = "s3://$BUCKET_NAME/artifacts/$LATEST_SHA/"
    aws s3 sync $S3_PATH $LOCAL_DIR --delete
    if ($LASTEXITCODE -ne 0) {
        throw "S3同期に失敗しました: $S3_PATH"
    }
    
    # SHAを記録
    $LATEST_SHA | Out-File $CURRENT_SHA_FILE -NoNewline
    Write-Host "Sync complete!" -ForegroundColor Green
}

# 5. ゲームの起動
Write-Host "Starting game..." -ForegroundColor Magenta
$GAME_EXE = Join-Path $LOCAL_DIR "game.exe"
if (-not (Test-Path $GAME_EXE)) {
    throw "game.exe が見つかりません: $GAME_EXE"
}
Start-Process $GAME_EXE