[CmdletBinding()]
param (
  [string]$OutputDir = "./backups",
  [string]$Uri = $env:MONGODB_URI
)

if (-not $Uri) {
  $Uri = "mongodb://127.0.0.1:27017/education_committee"
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Education Committee Examination Portal - Database Backup" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Timestamp  : $Timestamp"
Write-Host "Connecting to MongoDB..."

$DumpCmd = Get-Command "mongodump" -ErrorAction SilentlyContinue

if ($DumpCmd) {
  $BackupArchive = Join-Path $OutputDir "backup_$Timestamp.gz"
  Write-Host "Engine     : Native mongodump"
  Write-Host "Target     : $BackupArchive"
  & mongodump --uri="$Uri" --archive="$BackupArchive" --gzip
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[SUCCESS] Database backup completed: $BackupArchive" -ForegroundColor Green
    exit 0
  } else {
    Write-Host "[ERROR] mongodump exited with code $LASTEXITCODE" -ForegroundColor Red
    exit 1
  }
} else {
  $BackupJson = Join-Path $OutputDir "backup_$Timestamp.json"
  Write-Host "Engine     : Node.js Database Engine (mongodump binary not found in PATH)"
  Write-Host "Target     : $BackupJson"
  
  $ScriptPath = Join-Path $PSScriptRoot "db_backup_restore.js"
  $env:MONGODB_URI = $Uri
  & node $ScriptPath backup $BackupJson
  
  if ($LASTEXITCODE -eq 0 -and (Test-Path $BackupJson)) {
    Write-Host "[SUCCESS] Node.js database backup completed: $BackupJson" -ForegroundColor Green
    exit 0
  } else {
    Write-Host "[ERROR] Database backup failed." -ForegroundColor Red
    exit 1
  }
}
