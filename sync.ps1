$ErrorActionPreference = "Stop"

# 設定路徑
$ZipPath = "E:\MIKA\Downloads\RP-world.zip" # 請確認您的下載路徑是否正確
$ExtractPath = "E:\MIKA\RP-world"

Write-Host "開始同步專案..." -ForegroundColor Cyan

# 1. 檢查 ZIP 檔是否存在
if (!(Test-Path $ZipPath)) {
    Write-Host "找不到 ZIP 檔案: $ZipPath" -ForegroundColor Red
    Write-Host "請確認您已經從 AI Studio 下載了 ZIP 檔，並放在正確的路徑。" -ForegroundColor Yellow
    exit
}

# 2. 解壓縮並覆蓋檔案
Write-Host "正在解壓縮並覆蓋檔案..." -ForegroundColor Cyan
# 使用 Expand-Archive 會建立一個子資料夾，所以我們先解壓縮到一個暫存資料夾
$TempPath = Join-Path $env:TEMP "RP-world-temp"
if (Test-Path $TempPath) { Remove-Item $TempPath -Recurse -Force }
New-Item -ItemType Directory -Path $TempPath | Out-Null

Expand-Archive -Path $ZipPath -DestinationPath $TempPath -Force

# 複製暫存資料夾內的內容到目標資料夾 (假設 ZIP 內有一層與專案同名的資料夾)
$SourceFolder = Get-ChildItem -Path $TempPath -Directory | Select-Object -First 1
if ($SourceFolder) {
    Copy-Item -Path "$($SourceFolder.FullName)\*" -Destination $ExtractPath -Recurse -Force
} else {
    # 如果沒有子資料夾，直接複製內容
    Copy-Item -Path "$TempPath\*" -Destination $ExtractPath -Recurse -Force
}

# 清理暫存資料夾和下載的 ZIP 檔
Remove-Item $TempPath -Recurse -Force
Remove-Item $ZipPath -Force
Write-Host "檔案覆蓋完成！" -ForegroundColor Green

# 3. 執行 Git 指令
Write-Host "正在推送到 GitHub..." -ForegroundColor Cyan
Set-Location $ExtractPath

# 檢查是否有變更
$GitStatus = git status --porcelain
if ([string]::IsNullOrWhiteSpace($GitStatus)) {
    Write-Host "沒有偵測到任何變更，無需推送。" -ForegroundColor Yellow
    exit
}

git add .
$CommitMessage = "Update from AI Studio: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
git commit -m $CommitMessage
git push origin main

Write-Host "同步完成！已成功推送到 GitHub。" -ForegroundColor Green
