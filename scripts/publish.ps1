<#
.SYNOPSIS
  リリース用の self-contained single file exe を生成し、zip にまとめる。
  CIのReleaseワークフローとローカル検証の両方から呼ばれる共通スクリプト。

.NOTES
  スタートアッププロジェクトの検出は暫定実装。.NETプロジェクト作成後、
  $startupProjectNamePattern を実際のプロジェクト名に合わせて調整すること。
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$Runtime = "win-x64",
    [string]$Configuration = "Release"
)
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

# TODO: プロジェクト作成後、実際のスタートアッププロジェクト名に置き換える（例: WorkManager.App.csproj）
$startupProjectNamePattern = "*.App.csproj"
$project = Get-ChildItem -Path $repoRoot -Filter $startupProjectNamePattern -Recurse -File | Select-Object -First 1

if (-not $project) {
    Write-Error "スタートアッププロジェクト（$startupProjectNamePattern）が見つかりません。scripts/publish.ps1 のパターンを実プロジェクトに合わせて更新してください。"
    exit 1
}

$publishDir = Join-Path $repoRoot "artifacts/publish"
$artifactsDir = Join-Path $repoRoot "artifacts"
if (Test-Path $publishDir) { Remove-Item $publishDir -Recurse -Force }

Write-Host "Publishing: $($project.Name) [$Configuration/$Runtime] Version=$Version"
dotnet publish $project.FullName `
    -c $Configuration `
    -r $Runtime `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:Version=$Version `
    -o $publishDir

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$zipPath = Join-Path $artifactsDir "work-manager-$Version-$Runtime.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Compress-Archive -Path (Join-Path $publishDir "*") -DestinationPath $zipPath
Write-Host "Published: $zipPath"
