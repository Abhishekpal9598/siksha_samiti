<#
.SYNOPSIS
  Automated MongoDB Database Backup Script for Education Committee Examination Portal
.DESCRIPTION
  Creates a timestamped, compressed mongodump archive of the application database.
.PARAMETER OutputDir
  Directory where backups will be stored (defaults to ./backups)
.PARAMETER Uri
  MongoDB connection URI (defaults to MONGODB_URI env var or local)
#>

[CmdletBinding()]
param (
  [string]$OutputDir = "./backups",
  [string]$Uri = $env:MONGODB_URI
)

if (-not $Uri) {
  $Uri = "mongodb://127.0.0.1:27017/education_committee"
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupDir = Join-Path $OutputDir "backup_$Timestamp"

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Education Committee Examination Portal — Database Backup" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Timestamp  : $Timestamp"
Write-Host "Backup Path: $BackupDir.gz"
Write-Host "Connecting to MongoDB..."

# Test mongodump existence
$DumpCmd = Get-Command "mongodump" -ErrorAction SilentlyContinue

if ($DumpCmd) {
  & mongodump --uri="$Uri" --archive="$BackupDir.gz" --gzip
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[SUCCESS] Database backup completed: $BackupDir.gz" -ForegroundColor Green
  } else {
    Write-Host "[ERROR] mongodump exited with code $LASTEXITCODE" -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "[WARN] 'mongodump' command not found in PATH." -ForegroundColor Yellow
  Write-Host "       Please ensure MongoDB Database Tools are installed:" -ForegroundColor Yellow
  Write-Host "       https://www.mongodb.com/try/download/database-tools" -ForegroundColor Yellow
  Write-Host "       Example direct command:" -ForegroundColor Yellow
  Write-Host "       mongodump --uri=`"$Uri`" --archive=`"$BackupDir.gz`" --gzip" -ForegroundColor DarkGray
  exit 1
}
