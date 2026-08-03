<#
.SYNOPSIS
  work-manager の単体テストを実行する。CIとローカル検証の両方から呼ばれる共通スクリプト。
#>
param(
    [string]$Configuration = "Release"
)
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$solution = Get-ChildItem -Path $repoRoot -Filter "*.sln" -File | Select-Object -First 1

if (-not $solution) {
    Write-Error "リポジトリ直下に .sln が見つかりません。.NETプロジェクトを作成してから実行してください。"
    exit 1
}

$resultsDir = Join-Path $repoRoot "artifacts/test-results"
New-Item -ItemType Directory -Force -Path $resultsDir | Out-Null

Write-Host "Testing: $($solution.Name) [$Configuration]"
dotnet test $solution.FullName `
    -c $Configuration `
    --logger "trx;LogFileName=test-results.trx" `
    --results-directory $resultsDir

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
