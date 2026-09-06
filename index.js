import axios from 'axios';
import notifier from 'node-notifier';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import open from 'open';
import { exec } from 'child_process';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MY_LAT = parseFloat(process.env.MY_LAT);
const MY_LON = parseFloat(process.env.MY_LON);
const MAX_DISTANCE_KM = parseFloat(process.env.MAX_DISTANCE_KM) || 5;
const INTERVAL_MS = (parseInt(process.env.POLL_INTERVAL_SEC, 10) || 15) * 1000;


const APP_LOGO = path.resolve(__dirname, 'assets', 'logo.png');

const notifiedFlights = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

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
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    const response = await axios.get(`https://api.adsbdb.com/v0/callsign/${callsign.trim()}`, {
      timeout: 3000
    });
    const route = response.data?.response?.flightroute;
    if (route) {
      const origin = route.origin?.municipality ? `${route.origin.municipality} (${route.origin.iata_code})` : (route.origin?.name || 'Origem Desc.');
      const destination = route.destination?.municipality ? `${route.destination.municipality} (${route.destination.iata_code})` : (route.destination?.name || 'Destino Desc.');
      return `${origin} -> ${destination}`;
    }
  } catch {
    // falha silenciosa se a rota não existir na base de dados
  }
  return null;
}

function getNotificationImage(prefix) {
  const customAirlinePath = path.resolve(__dirname, `assets/airlines/${prefix.toLowerCase()}.png`);
  if (fs.existsSync(customAirlinePath)) {
    return customAirlinePath;
  }
  const defaultPath = path.resolve(__dirname, 'assets/airlines/default.png');
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }
  return fs.existsSync(APP_LOGO) ? APP_LOGO : undefined;
}

async function checkAirspace() {
  const now = Date.now();
  for (const [icao, timestamp] of notifiedFlights.entries()) {
    if (now - timestamp > CACHE_TTL_MS) notifiedFlights.delete(icao);
  }

  const bbox = getBoundingBox(MY_LAT, MY_LON, MAX_DISTANCE_KM);
  const url = `https://opensky-network.org/api/states/all?lamin=${bbox.lamin}&lomin=${bbox.lomin}&lamax=${bbox.lamax}&lomax=${bbox.lomax}`;

  try {
    const response = await axios.get(url, { timeout: 8000 });
    const states = response.data.states;
    if (!states || states.length === 0) return;

    for (const flight of states) {
      const icao24 = flight[0];
      const callsign = (flight[1] || '').trim();
      const lon = flight[5];
      const lat = flight[6];
      const baroAltitude = flight[7];
      

      if (lat == null || lon == null) continue;

      const distance = haversineDistance(MY_LAT, MY_LON, lat, lon);

      if (distance <= MAX_DISTANCE_KM && !notifiedFlights.has(icao24)) {
        notifiedFlights.set(icao24, now);

        const prefix = callsign.slice(0, 3).toUpperCase();
        const airlineName = AIRLINE_PREFIXES[prefix] || (prefix ? `Companhia (${prefix})` : 'Desconhecida');
        const altKm = baroAltitude ? (baroAltitude / 1000).toFixed(1) : 'N/A';
        const distKm = distance.toFixed(1);

        const route = await fetchFlightRoute(callsign);
        const routeText = route ? `Rota: ${route}` : 'Rota: Indisponível em tempo real';

        const imagePath = getNotificationImage(prefix);

        console.log(`\n [AeroAlert] ${callsign || icao24} (${airlineName})`);
        console.log(`${routeText} | Distância: ${distKm} km | Altitude: ${altKm} km`);

        const trackingUrl = callsign 
          ? `https://www.flightradar24.com/${callsign}` 
          : `https://www.google.com/maps?q=${lat},${lon}`;

        const toaster = new notifier.WindowsToaster();

        toaster.notify(
          {
            title: `${airlineName} (${callsign || 'Sem indicativo'})`,
            message: `${routeText}\nDistância: ${distKm} km | Altitude: ${altKm} km`,
            icon: imagePath,
            appID: 'AeroAlert',
            sound: true,
            wait: true,
            extra: ['-action', trackingUrl]
          },
          (err, response) => {
            const res = (response || '').toString().toLowerCase();

            if (res.includes('activate') || res.includes('clicked') || !res.includes('timeout')) {
              if (!res.includes('dismissed')) {
                console.log('[AeroAlert] Notificação clicada. A abrir radar...');
                exec(`start "" "${trackingUrl}"`);
              }
            }
          }
        );
      }
    }
  } catch (error) {
    if (error.response?.status !== 429) {
      console.error('Erro na verificação:', error.message);
    }
  }
}

console.log('--- AeroAlert Iniciado ---');
console.log(`Ponto central: ${MY_LAT}, ${MY_LON} (Raio: ${MAX_DISTANCE_KM} km)`);
checkAirspace();
setInterval(checkAirspace, INTERVAL_MS);