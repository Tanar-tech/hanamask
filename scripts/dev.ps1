<#
.SYNOPSIS
  work-manager をローカルで起動する（管理者の動作確認用ワンコマンド）。
.DESCRIPTION
  1. PostgreSQLを用意する（優先順: 既に5432で稼働中のDB → Docker → ポータブル版PostgreSQLを自動セットアップ）
  2. .env.local が無ければ自動生成（AUTH_SECRETも自動生成）
  3. 依存関係インストール・DBマイグレーション・サンプルデータ投入
  4. 開発サーバーを起動（フロント http://localhost:3000 / APIサーバー http://localhost:3001。
     フロントの /api/* はAPIサーバーへプロキシされる。本番のCloudFront+API Gateway構成と同じ構図。docs/AWS.md）
.NOTES
  ポータブル版PostgreSQLは %LOCALAPPDATA%\work-manager\ 配下に展開され、
  システム（サービス登録・レジストリ・PATH）には一切変更を加えない。
  停止: このスクリプトをCtrl+Cで終了後、DBも止める場合は ./scripts/dev.ps1 -StopDb
.EXAMPLE
  ./scripts/dev.ps1
#>
param(
    [switch]$StopDb
)
$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$pgRoot = Join-Path $env:LOCALAPPDATA "work-manager"
$pgHome = Join-Path $pgRoot "pgsql"          # 展開先（pgsql\bin\... となる）
$pgData = Join-Path $pgRoot "pgdata"
$pgLog  = Join-Path $pgRoot "pg.log"
$pgZip  = Join-Path $pgRoot "postgresql-16.9-binaries.zip"
$pgUrl  = "https://get.enterprisedb.com/postgresql/postgresql-16.9-1-windows-x64-binaries.zip"
$pgCtl  = Join-Path $pgHome "bin\pg_ctl.exe"

function Test-PortListening([int]$Port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $ok = $async.AsyncWaitHandle.WaitOne(500)
        if ($ok -and $client.Connected) { $client.Close(); return $true }
        $client.Close(); return $false
    } catch { return $false }
}

if ($StopDb) {
    if (Test-Path $pgCtl) {
        & $pgCtl -D $pgData stop 2>&1 | Out-Null
        Write-Host "ポータブルPostgreSQLを停止しました。"
    }
    try { docker compose stop db 2>&1 | Out-Null } catch {}
    exit 0
}

# --- 1. PostgreSQL ---
Write-Host "`n[1/4] PostgreSQLを確認しています..." -ForegroundColor Cyan

if (Test-PortListening 5432) {
    Write-Host "PostgreSQL: 既にポート5432で稼働中のDBを使用します" -ForegroundColor Green
} else {
    $dockerReady = $false
    try {
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { $dockerReady = $true }
    } catch {}

    if ($dockerReady) {
        Write-Host "Docker経由でPostgreSQLコンテナを起動します..."
        docker compose up -d db
        if ($LASTEXITCODE -ne 0) { Write-Error "PostgreSQLコンテナの起動に失敗しました。"; exit 1 }
        $elapsed = 0
        while ($elapsed -lt 60) {
            $health = docker inspect --format "{{.State.Health.Status}}" work-manager-db 2>$null
            if ($health -eq "healthy") { break }
            Start-Sleep -Seconds 2; $elapsed += 2
        }
        if ($elapsed -ge 60) { Write-Error "PostgreSQLが起動しませんでした。'docker logs work-manager-db' を確認してください。"; exit 1 }
        Write-Host "PostgreSQL: Dockerコンテナで起動済み (localhost:5432)" -ForegroundColor Green
    } else {
        Write-Host "Dockerが利用できないため、ポータブル版PostgreSQLを使用します（初回のみダウンロード約300MB）..."
        New-Item -ItemType Directory -Force $pgRoot | Out-Null

        if (-not (Test-Path $pgCtl)) {
            if (-not (Test-Path $pgZip)) {
                Write-Host "PostgreSQLバイナリをダウンロード中..."
                # 進捗バー描画はダウンロードを大幅に遅くするため無効化する
                $prevProgress = $ProgressPreference
                $ProgressPreference = "SilentlyContinue"
                Invoke-WebRequest -Uri $pgUrl -OutFile $pgZip -UseBasicParsing
                $ProgressPreference = $prevProgress
            }
            Write-Host "展開中..."
            $extractTmp = Join-Path $pgRoot "extract-tmp"
            if (Test-Path $extractTmp) { Remove-Item -Recurse -Force $extractTmp -Confirm:$false }
            Expand-Archive -Path $pgZip -DestinationPath $extractTmp
            Move-Item (Join-Path $extractTmp "pgsql") $pgHome
            Remove-Item -Recurse -Force $extractTmp -Confirm:$false
        }

        if (-not (Test-Path (Join-Path $pgData "PG_VERSION"))) {
            Write-Host "データベースクラスタを初期化中..."
            # ローカル動作確認専用のためtrust認証（127.0.0.1のみ待ち受け）。
            # NOTE: initdbはtrust認証の注意をstderrに出す。$ErrorActionPreference=Stop のままだと
            # 2>&1 リダイレクトがNativeCommandErrorとして致命化するため、一時的に緩める。
            $prevEap = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            & (Join-Path $pgHome "bin\initdb.exe") -D $pgData -U workmanager --auth=trust -E UTF8 --no-instructions 2>&1 | Out-Null
            $ErrorActionPreference = $prevEap
            if ($LASTEXITCODE -ne 0) { Write-Error "initdbに失敗しました。"; exit 1 }
        }

        # NOTE: pg_ctl をパイプ（| Out-Null 等）に繋ぐと、pg_ctl終了後もpostgresデーモンが
        # 継承したstdoutハンドルを保持し続けるためパイプが閉じず、スクリプトがハングする。
        # Start-Process（-Waitなし）で起動し、ポート監視で起動完了を判定する。
        Start-Process -FilePath $pgCtl -ArgumentList "-D `"$pgData`" -l `"$pgLog`" -o `"-p 5432 -h 127.0.0.1`" start" -NoNewWindow
        $elapsed = 0
        while (-not (Test-PortListening 5432) -and $elapsed -lt 30) { Start-Sleep -Seconds 1; $elapsed += 1 }
        if (-not (Test-PortListening 5432)) { Write-Error "PostgreSQLが起動しませんでした。ログ: $pgLog"; exit 1 }

        $psql = Join-Path $pgHome "bin\psql.exe"
        # NOTE: 2>$null 等のstderrリダイレクトは $ErrorActionPreference=Stop 下で
        # NativeCommandErrorとしてスクリプトを停止させ得るため使わない。
        $dbExists = & $psql -U workmanager -h 127.0.0.1 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='work_manager'"
        if ($dbExists -ne "1") {
            & $psql -U workmanager -h 127.0.0.1 -d postgres -c "CREATE DATABASE work_manager" | Out-Null
        }
        Write-Host "PostgreSQL: ポータブル版で起動済み (localhost:5432)" -ForegroundColor Green
    }
}

# --- 2. .env.local ---
Write-Host "`n[2/4] 環境変数を確認しています..." -ForegroundColor Cyan
$envFile = Join-Path $repoRoot ".env.local"
if (-not (Test-Path $envFile)) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = [Convert]::ToBase64String($bytes)
    @(
        'DATABASE_URL="postgresql://workmanager:workmanager-local@localhost:5432/work_manager"'
        "AUTH_SECRET=`"$secret`""
    ) | Out-File -FilePath $envFile -Encoding utf8
    Write-Host ".env.local を自動生成しました" -ForegroundColor Green
} else {
    Write-Host ".env.local は既に存在します（そのまま使用）" -ForegroundColor Green
}

# --- 3. 依存関係・マイグレーション・シード ---
Write-Host "`n[3/4] 依存関係とDBを準備しています..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
    npm ci
    if ($LASTEXITCODE -ne 0) { Write-Error "npm ci に失敗しました。"; exit 1 }
}
# Prismaは .env を読むため、.env.local の内容を環境変数として渡す
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([A-Z_]+)="?([^"]*)"?$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
    }
}
npx prisma migrate dev --skip-seed --name init
if ($LASTEXITCODE -ne 0) { Write-Error "DBマイグレーションに失敗しました。"; exit 1 }
npx tsx prisma/seed.ts
if ($LASTEXITCODE -ne 0) { Write-Error "サンプルデータ投入に失敗しました。"; exit 1 }

# --- 4. 開発サーバー ---
Write-Host "`n[4/4] 開発サーバーを起動します..." -ForegroundColor Cyan
Write-Host ""
Write-Host "  URL:              http://localhost:3000 （APIサーバー: http://localhost:3001）" -ForegroundColor Yellow
Write-Host "  動作確認用ログイン: admin@example.com / password123" -ForegroundColor Yellow
Write-Host "  終了:             Ctrl+C（DBも停止する場合: ./scripts/dev.ps1 -StopDb）" -ForegroundColor Yellow
Write-Host ""
# APIサーバー（src/server/local.ts）を並走させ、フロント終了時に必ず道連れにする。
# npm.cmd→tsx→node と子プロセスが連なるため、taskkill /T でツリーごと停止する。
$apiProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev:api" -NoNewWindow -PassThru
try {
    npm run dev
} finally {
    if ($apiProc -and -not $apiProc.HasExited) {
        taskkill /PID $apiProc.Id /T /F 2>&1 | Out-Null
    }
}
