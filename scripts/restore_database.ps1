[CmdletBinding()]
param (
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,
  [string]$Uri = $env:MONGODB_URI
)

if (-not $Uri) {
  $Uri = "mongodb://127.0.0.1:27017/education_committee"
}

if (-not (Test-Path $ArchivePath)) {
  Write-Host "[ERROR] Archive file not found: $ArchivePath" -ForegroundColor Red
  exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Education Committee Examination Portal - Database Restore" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Source Archive: $ArchivePath"

if ($ArchivePath.EndsWith(".json")) {
  Write-Host "Engine        : Node.js Universal Restore Engine"
  $ScriptPath = Join-Path $PSScriptRoot "db_backup_restore.js"
  $env:MONGODB_URI = $Uri
  & node $ScriptPath restore $ArchivePath
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[SUCCESS] Database restoration completed successfully!" -ForegroundColor Green
    exit 0
  } else {
    Write-Host "[ERROR] Restoration failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
  }
} else {
  $RestoreCmd = Get-Command "mongorestore" -ErrorAction SilentlyContinue
  if ($RestoreCmd) {
    Write-Host "Engine        : Native mongorestore"
    & mongorestore --uri="$Uri" --archive="$ArchivePath" --gzip --drop
    if ($LASTEXITCODE -eq 0) {
      Write-Host "[SUCCESS] Database restoration completed successfully!" -ForegroundColor Green
      exit 0
    } else {
      Write-Host "[ERROR] mongorestore exited with code $LASTEXITCODE" -ForegroundColor Red
      exit 1
    }
  } else {
    Write-Host "[ERROR] mongorestore binary not found in PATH to restore .gz archive." -ForegroundColor Red
    exit 1
  }
}
