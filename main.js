import { app, BrowserWindow, ipcMain, shell, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(app.getPath('userData'), 'aeroalert-config.json');

let currentConfig = {
  lat: 38.8950,
  lon: -9.0400,
  maxDist: 4,
  pollSec: 15
};

function loadStoredConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      currentConfig = { ...currentConfig, ...data };
    }
  } catch (error) {
    console.error('[AeroAlert] Failed to read stored config:', error.message);
  }
}

function saveStoredConfig(newConfig) {
  try {
    currentConfig = { ...currentConfig, ...newConfig };
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2));
  } catch (error) {
    console.error('[AeroAlert] Failed to write config to disk:', error.message);
  }
}

const notifiedFlights = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
let mainWindow = null;
let pollTimer = null;

const AIRLINE_PREFIXES = {
  TAP: 'TAP Air Portugal',
  RYR: 'Ryanair',
  EJU: 'easyJet Europe',
  EZY: 'easyJet',
  UAE: 'Emirates',
  VLG: 'Vueling',
  IBE: 'Iberia',
  AFR: 'Air France',
  DLH: 'Lufthansa',
  BAW: 'British Airways',
  KLM: 'KLM',
  WZZ: 'Wizz Air',
  THY: 'Turkish Airlines',
  SWR: 'Swiss'
};

function haversineDistance(lat1, lon1, lat2, lon2) {
  const EARTH_RADIUS_KM = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getBoundingBox(lat, lon, radiusKm) {
  const deltaLat = (radiusKm * 1.5) / 111;
  const deltaLon = (radiusKm * 1.5) / (111 * Math.cos(lat * (Math.PI / 180)));
  return {
    lamin: lat - deltaLat,
    lamax: lat + deltaLat,
    lomin: lon - deltaLon,
    lomax: lon + deltaLon
  };
}

async function fetchFlightRoute(callsign) {
  if (!callsign) return null;
  try {
    const response = await axios.get(`https://api.adsbdb.com/v0/callsign/${callsign.trim()}`, { timeout: 3000 });
    const route = response.data?.response?.flightroute;
    if (route) {
      const origin = route.origin?.municipality || route.origin?.name || route.origin?.iata_code || 'Unknown Origin';
      const destination = route.destination?.municipality || route.destination?.name || route.destination?.iata_code || 'Unknown Destination';
      return `${origin} -> ${destination}`;
    }
  } catch (error) {}
  return null;
}

function getNotificationImage(prefix) {
  const customAirline = path.join(__dirname, 'assets', 'airlines', `${prefix.toLowerCase()}.png`);
  if (fs.existsSync(customAirline)) return customAirline;
  const defaultPath = path.join(__dirname, 'assets', 'airlines', 'default.png');
  if (fs.existsSync(defaultPath)) return defaultPath;
  return path.join(__dirname, 'assets', 'logo.png');
}

async function checkAirspace() {
  const now = Date.now();
  for (const [icao, timestamp] of notifiedFlights.entries()) {
    if (now - timestamp > CACHE_TTL_MS) {
      notifiedFlights.delete(icao);
    }
  }

  const { lat, lon, maxDist } = currentConfig;
  if (!lat || !lon || !maxDist) return;

  const bbox = getBoundingBox(lat, lon, maxDist);
  const endpoint = `https://opensky-network.org/api/states/all?lamin=${bbox.lamin}&lomin=${bbox.lomin}&lamax=${bbox.lamax}&lomax=${bbox.lomax}`;

  try {
    const response = await axios.get(endpoint, { timeout: 8000 });
    const states = response.data?.states;
    if (!states || states.length === 0) return;

    for (const flight of states) {
      const icao24 = flight[0];
      const callsign = (flight[1] || '').trim();
      const fLon = flight[5];
      const fLat = flight[6];
      const baroAltitude = flight[7];

      if (fLat == null || fLon == null) continue;
      const distance = haversineDistance(lat, lon, fLat, fLon);

      if (distance <= maxDist && !notifiedFlights.has(icao24)) {
        notifiedFlights.set(icao24, now);

        const prefix = callsign.slice(0, 3).toUpperCase();
        const airlineName = AIRLINE_PREFIXES[prefix] || (prefix ? `Airline (${prefix})` : 'Unknown Airline');
        const altKm = baroAltitude ? (baroAltitude / 1000).toFixed(1) : 'N/A';
        const distKm = distance.toFixed(1);

        const route = await fetchFlightRoute(callsign);
        const routeText = route || 'Live route unavailable';
        const trackingUrl = callsign 
          ? `https://www.flightradar24.com/${callsign}` 
          : `https://www.google.com/maps?q=${fLat},${fLon}`;
        const imagePath = getNotificationImage(prefix);

        if (Notification.isSupported()) {
          const toast = new Notification({
            title: `${airlineName} (${callsign || 'No callsign'})`,
            body: `Route: ${routeText}\nDistance: ${distKm} km | Altitude: ${altKm} km`,
            icon: imagePath
          });
          toast.on('click', () => {
            shell.openExternal(trackingUrl);
          });
          toast.show();
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('new-flight', {
            callsign,
            airlineName,
            route: routeText,
            distKm,
            altKm,
            trackingUrl,
            imagePath: pathToFileURL(imagePath).href
          });
        }
      }
    }
  } catch (error) {
    console.error('[AeroAlert] Airspace poll request error:', error.message);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  checkAirspace();
  pollTimer = setInterval(checkAirspace, currentConfig.pollSec * 1000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 620,
    height: 720,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    startPolling();
  });
}

app.whenReady().then(() => {
  const APP_ID = 'AeroAlert';
  app.setAppUserModelId(APP_ID);

  if (process.platform === 'win32') {
    try {
      const startMenuDir = path.join(
        process.env.APPDATA,
        'Microsoft',
        'Windows',
        'Start Menu',
        'Programs'
      );
      const shortcutPath = path.join(startMenuDir, 'AeroAlert.lnk');

      shell.writeShortcutLink(shortcutPath, {
        target: process.execPath,
        args: app.isPackaged ? '' : `"${path.resolve(__dirname)}"`,
        appUserModelId: APP_ID,
        description: 'AeroAlert'
      });
    } catch {}
  }

  loadStoredConfig();
  createWindow();

  ipcMain.handle('get-config', () => currentConfig);

  ipcMain.on('save-config', (_event, newConfig) => {
    notifiedFlights.clear();
    saveStoredConfig(newConfig);
    startPolling();
  });

  ipcMain.on('open-radar', (_event, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle('get-current-location', async () => {
    try {
      const res = await axios.get('https://ipapi.co/json/', { timeout: 5000 });
      if (res.data && res.data.latitude && res.data.longitude) {
        return {
          success: true,
          lat: res.data.latitude,
          lon: res.data.longitude,
          city: res.data.city || 'Current Location'
        };
      }
    } catch {}
    return { success: false, error: 'Could not detect location via IP.' };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});