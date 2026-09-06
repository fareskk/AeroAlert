import { app, BrowserWindow, ipcMain, shell, Notification, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

const configPath = path.join(app.getPath('userData'), 'aeroalert-config.json');

let currentConfig = {
  lat: null,
  lon: null,
  maxDist: 5,
  pollSec: 15,
  notificationsEnabled: true
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

async function fetchFlightDetails(callsign) {
  if (!callsign) return { routeText: 'Live route unavailable', airlineName: null };

  try {
    const response = await axios.get(`https://api.adsbdb.com/v0/callsign/${callsign.trim()}`, { timeout: 3500 });
    const data = response.data?.response;
    const apiAirlineName = data?.flightroute?.airline?.name || null;
    const route = data?.flightroute;

    let routeText = 'Live route unavailable';
    if (route) {
      const origin = route.origin?.municipality || route.origin?.name || route.origin?.iata_code || 'Unknown Origin';
      const destination = route.destination?.municipality || route.destination?.name || route.destination?.iata_code || 'Unknown Destination';
      routeText = `${origin} -> ${destination}`;
    }

    return { routeText, airlineName: apiAirlineName };
  } catch (error) {
    return { routeText: 'Live route unavailable', airlineName: null };
  }
}

function getNotificationImage(prefix) {
  const customAirline = path.join(__dirname, 'assets', 'airlines', `${prefix.toLowerCase()}.png`);
  if (fs.existsSync(customAirline)) return customAirline;
  const defaultPath = path.join(__dirname, 'assets', 'airlines', 'default.png');
  if (fs.existsSync(defaultPath)) return defaultPath;
  return path.join(__dirname, 'assets', 'logo.png');
}

async function fetchAirspaceData(lat, lon, radiusNm) {
  const primaryEndpoint = `https://api.adsb.lol/v2/point/${lat}/${lon}/${radiusNm}`;
  const fallbackEndpoint = `https://api.airplanes.live/v2/point/${lat}/${lon}/${radiusNm}`;

  const requestHeaders = {
    'User-Agent': 'AeroAlert/1.0 (Desktop Flight Tracker)',
    'Accept': 'application/json'
  };

  try {
    const response = await axios.get(primaryEndpoint, { timeout: 8000, headers: requestHeaders });
    return response.data?.ac || [];
  } catch (primaryError) {
    try {
      const fallbackResponse = await axios.get(fallbackEndpoint, { timeout: 8000, headers: requestHeaders });
      return fallbackResponse.data?.ac || [];
    } catch (fallbackError) {
      throw new Error(`Airspace requests failed: ${fallbackError.message}`);
    }
  }
}

async function checkAirspace() {
  const now = Date.now();
  for (const [icao, timestamp] of notifiedFlights.entries()) {
    if (now - timestamp > CACHE_TTL_MS) {
      notifiedFlights.delete(icao);
    }
  }

  const { lat, lon, maxDist } = currentConfig;
  if (lat == null || lon == null || !maxDist) return;

  const radiusNm = Math.ceil(maxDist * 0.539957);

  try {
    const flights = await fetchAirspaceData(lat, lon, radiusNm);

    console.log(`[AeroAlert] Airspace check completed. Aircraft found: ${flights.length}`);

    if (flights.length === 0) return;

    for (const flight of flights) {
      const icao24 = flight.hex;
      const callsign = (flight.flight || flight.r || '').trim();
      const fLat = flight.lat;
      const fLon = flight.lon;
      const baroAltitudeMeters = flight.alt_baro === 'ground' ? 0 : (typeof flight.alt_baro === 'number' ? flight.alt_baro * 0.3048 : null);

      if (fLat == null || fLon == null) continue;
      const distance = haversineDistance(lat, lon, fLat, fLon);

      if (distance <= maxDist && !notifiedFlights.has(icao24)) {
        notifiedFlights.set(icao24, now);

        const isTailNumber = callsign.includes('-') || /^[A-Z0-9]{1,2}-[A-Z0-9]+$/i.test(callsign);
        const prefix = callsign.slice(0, 3).toUpperCase();
        const flightDetails = await fetchFlightDetails(callsign);

        let airlineName;
        if (flightDetails.airlineName) {
          airlineName = flightDetails.airlineName;
        } else if (AIRLINE_PREFIXES[prefix]) {
          airlineName = AIRLINE_PREFIXES[prefix];
        } else if (isTailNumber || !prefix) {
          airlineName = 'Private / General Aviation';
        } else {
          airlineName = `Airline (${prefix})`;
        }

        const routeText = flightDetails.routeText;
        const altKm = baroAltitudeMeters != null ? (baroAltitudeMeters / 1000).toFixed(1) : 'N/A';
        const distKm = distance.toFixed(1);

        const trackingUrl = callsign 
          ? `https://www.flightradar24.com/${callsign}` 
          : `https://www.google.com/maps?q=${fLat},${fLon}`;
        const imagePath = getNotificationImage(prefix);

        if (currentConfig.notificationsEnabled && Notification.isSupported()) {
          const toast = new Notification({
            title: `${airlineName} (${callsign || 'No callsign'})`,
            body: `Route: ${routeText}\nDistance: ${distKm} km | Altitude: ${altKm} km`,
            icon: imagePath,
            silent: true
          });
          toast.on('click', () => {
            shell.openExternal(trackingUrl);
          });
          toast.show();
        }

        const detectedAt = new Date().toLocaleTimeString([], { 
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('new-flight', {
            callsign,
            airlineName,
            route: routeText,
            distKm,
            altKm,
            trackingUrl,
            imagePath: pathToFileURL(imagePath).href,
            playSound: currentConfig.notificationsEnabled,
            detectedAt
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

  if (currentConfig.lat == null || currentConfig.lon == null) {
    console.log('[AeroAlert] No location configured. Polling is idle.');
    return;
  }

  checkAirspace();
  pollTimer = setInterval(checkAirspace, currentConfig.pollSec * 1000);
}

function createWindow() {
  const iconFile = path.join(__dirname, 'assets', 'icon.ico');
  const appIcon = fs.existsSync(iconFile) ? nativeImage.createFromPath(iconFile) : null;

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

  if (appIcon && !appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon);
  }

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

  app.setAppUserModelId('com.aeroalert.app');
  loadStoredConfig();
  createWindow();

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.handle('get-config', () => currentConfig);

  ipcMain.on('save-config', (_event, newConfig) => {
    notifiedFlights.clear();
    saveStoredConfig(newConfig);
    startPolling();
  });

  ipcMain.on('toggle-notifications', (_event, enabled) => {
    currentConfig.notificationsEnabled = enabled;
    saveStoredConfig({ notificationsEnabled: enabled });
  });

  ipcMain.on('open-radar', (_event, url) => {
    shell.openExternal(url);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});