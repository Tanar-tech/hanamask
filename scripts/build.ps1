<#
.SYNOPSIS
  work-manager をビルドする。CIとローカル検証の両方から呼ばれる共通スクリプト。
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

Write-Host "Restoring: $($solution.Name)"
dotnet restore $solution.FullName
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building: $($solution.Name) [$Configuration]"
dotnet build $solution.FullName -c $Configuration --no-restore
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
