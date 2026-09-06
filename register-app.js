import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ID = 'AeroAlert';
const APP_NAME = 'AeroAlert.lnk';
const LOGO_PATH = path.resolve(__dirname, 'assets', 'logo.png');

// Caminho da pasta de atalhos do Menu Iniciar do utilizador atual
const startMenuDir = path.join(
  process.env.APPDATA,
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs'
);

const shortcutPath = path.join(startMenuDir, APP_NAME);

// Script em PowerShell para criar o atalho com o AppID e ícone registados
const psScript = `
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut("${shortcutPath.replace(/\\/g, '\\\\')}")
$shortcut.TargetPath = "powershell.exe"
$shortcut.IconLocation = "${LOGO_PATH.replace(/\\/g, '\\\\')}"
$shortcut.Save()

# Regista o AUMID no atalho para o Windows ler no Toast
$bytes = [System.IO.File]::ReadAllBytes("${shortcutPath.replace(/\\/g, '\\\\')}")
`;

try {
  execSync(`powershell -Command "${psScript}"`);
  console.log('App registada com sucesso no Windows!');
} catch (err) {
  console.error('Erro ao registar atalho:', err.message);
}