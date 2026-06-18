// Create/refresh desktop shortcut pointing to the built EXE (Node.js, no PS dependency)
const { execSync } = require('child_process')
const { existsSync } = require('fs')
const { join } = require('path')

const desktop = join(require('os').homedir(), 'Desktop')
const lnkPath = join(desktop, 'ZXCODE.lnk')
const targetPath = join(__dirname, '..', 'dist', 'Claude Code Desktop 1.0.0.exe')
const workDir = join(__dirname, '..')

if (!existsSync(targetPath)) {
  console.error('Target EXE not found:', targetPath)
  process.exit(1)
}

// Use PowerShell via cmd (more reliable in npm scripts)
const ps = `$WshShell = New-Object -ComObject WScript.Shell; $s = $WshShell.CreateShortcut('${lnkPath}'); $s.TargetPath = '${targetPath}'; $s.WorkingDirectory = '${workDir}'; $s.Description = 'ZXCODE - Claude Code Desktop'; $s.Save()`
try {
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, { stdio: 'inherit' })
  console.log('Desktop shortcut updated:', lnkPath)
} catch {
  // Fallback: try pwsh
  try {
    execSync(`pwsh -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, { stdio: 'inherit' })
    console.log('Desktop shortcut updated:', lnkPath)
  } catch {
    console.log('Could not create shortcut (PowerShell not available), but EXE built successfully.')
    console.log('Shortcut target:', targetPath)
  }
}
