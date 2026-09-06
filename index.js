import axios from 'axios';
import notifier from 'node-notifier';
import dotenv from 'dotenv';

dotenv.config();

const MY_LAT = parseFloat(process.env.MY_LAT);
const MY_LON = parseFloat(process.env.MY_LON);
const MAX_DISTANCE_KM = parseFloat(process.env.MAX_DISTANCE_KM) || 10;
const INTERVAL_MS = (parseInt(process.env.POLL_INTERVAL_SEC, 10) || 15) * 1000;

const notifiedFlights = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;


const AIRLINE_PREFIXES = {
  TAP: 'TAP Air Portugal',
  RYR: 'Ryanair',
  EJU: 'easyJet Europe',
  EZY: 'easyJet',
  VLG: 'Vueling',
  IBE: 'Iberia',
  AFR: 'Air France',
  DLH: 'Lufthansa',
  BAW: 'British Airways',
  KLM: 'KLM',
  WZZ: 'Wizz Air',
  THY: 'Turkish Airlines',
  SWR: 'Swiss International Air Lines'
};

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

function resolveAirline(callsign) {
  if (!callsign) return 'Desconhecida';
  const prefix = callsign.slice(0, 3).trim();
  return AIRLINE_PREFIXES[prefix] || `Companhia (${prefix})`;
}

async function checkAirspace() {
  const now = Date.now();
  for (const [icao, timestamp] of notifiedFlights.entries()) {
    if (now - timestamp > CACHE_TTL_MS) {
      notifiedFlights.delete(icao);
    }
  }

  const bbox = getBoundingBox(MY_LAT, MY_LON, MAX_DISTANCE_KM);
  const url = `https://opensky-network.org/api/states/all?lamin=${bbox.lamin}&lomin=${bbox.lomin}&lamax=${bbox.lamax}&lomax=${bbox.lomax}`;

  try {
    const response = await axios.get(url, { timeout: 8000 });
    const states = response.data.states;

    if (!states || states.length === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] Sem aeronaves detetadas na bounding box.`);
      return;
    }

    for (const flight of states) {
      const icao24 = flight[0];
      const callsign = (flight[1] || '').trim();
      const originCountry = flight[2];
      const lon = flight[5];
      const lat = flight[6];
      const baroAltitude = flight[7]; // metros

      if (lat == null || lon == null) continue;

      const distance = haversineDistance(MY_LAT, MY_LON, lat, lon);

      if (distance <= MAX_DISTANCE_KM && !notifiedFlights.has(icao24)) {
        notifiedFlights.set(icao24, now);

        const airline = resolveAirline(callsign);
        const altKm = baroAltitude ? (baroAltitude / 1000).toFixed(1) : 'N/A';
        const distKm = distance.toFixed(1);

        console.log(`\nAeronave por perto: ${callsign || icao24} (${airline})`);
        console.log(`Distância: ${distKm} km | Altitude: ${altKm} km | País Registo: ${originCountry}`);

        notifier.notify({
          title: `Avião por perto: ${callsign || 'Voo sem indicativo'}`,
          message: `Companhia: ${airline}\nDistância: ${distKm} km | Alt: ${altKm} km\nRegisto: ${originCountry}`,
          sound: true,
          wait: false
        });
      }
    }
  } catch (error) {
    if (error.response?.status === 429) {
      console.warn('Rate limit atingido na API OpenSky. Aguardar próximo ciclo.');
    } else {
      console.error('Erro na requisição OpenSky:', error.message);
    }
  }
}

console.log('--- AeroAlert Iniciado ---');
console.log(`Monitorizando centro: ${MY_LAT}, ${MY_LON} com raio de ${MAX_DISTANCE_KM} km`);
checkAirspace();
setInterval(checkAirspace, INTERVAL_MS);