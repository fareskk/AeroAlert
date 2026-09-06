const toggleBtn = document.getElementById('toggle-settings-btn');
const soundBtn = document.getElementById('toggle-sound-btn');
const settingsPanel = document.getElementById('settings-panel');
const cancelBtn = document.getElementById('cancel-btn');
const form = document.getElementById('config-form');
const addressInput = document.getElementById('address-input');
const searchAddressBtn = document.getElementById('search-address-btn');

const latInput = document.getElementById('lat');
const lonInput = document.getElementById('lon');
const distInput = document.getElementById('dist');
const statusText = document.getElementById('status-text');
const flightCount = document.getElementById('flight-count');
const container = document.getElementById('flights-container');

const alertAudio = new Audio('../assets/alert.mp3');

let totalFlights = 0;
let notificationsActive = true;
let map = null;
let marker = null;
let radiusCircle = null;
let reverseGeocodeTimeout = null;

function toggleDrawer() {
  if (!settingsPanel) return;
  settingsPanel.classList.toggle('hidden');
  if (!settingsPanel.classList.contains('hidden') && map) {
    setTimeout(() => {
      map.invalidateSize();
    }, 200);
  }
}

if (toggleBtn) toggleBtn.addEventListener('click', toggleDrawer);
if (cancelBtn) cancelBtn.addEventListener('click', toggleDrawer);

if (soundBtn) {
  soundBtn.addEventListener('click', () => {
    notificationsActive = !notificationsActive;
    soundBtn.textContent = notificationsActive ? '🔔' : '🔕';
    soundBtn.title = notificationsActive ? 'Notifications Enabled' : 'Notifications Muted';
    window.electronAPI.toggleNotifications(notificationsActive);
  });
}

function initMap(lat, lon, distKm) {
  const hasCoords = lat != null && lon != null;
  const initialLat = hasCoords ? lat : 38.7223;
  const initialLon = hasCoords ? lon : -9.1393;
  const initialZoom = hasCoords ? 12 : 6;

  if (map) return;

  map = L.map('map-container').setView([initialLat, initialLon], initialZoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  if (hasCoords) {
    marker = L.marker([initialLat, initialLon], { draggable: true }).addTo(map);
    radiusCircle = L.circle([initialLat, initialLon], {
      radius: distKm * 1000,
      color: '#1f6feb',
      fillColor: '#1f6feb',
      fillOpacity: 0.15
    }).addTo(map);

    if (!addressInput.value) {
      reverseGeocode(initialLat, initialLon);
    }

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      updateLocation(pos.lat, pos.lng, true);
    });
  }

  map.on('click', (e) => {
    updateLocation(e.latlng.lat, e.latlng.lng, true);
  });
}

function reverseGeocode(lat, lon) {
  clearTimeout(reverseGeocodeTimeout);
  reverseGeocodeTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (data && data.display_name) {
        const parts = data.display_name.split(',').map(p => p.trim());
        const shortName = parts.slice(0, 3).join(', ');
        addressInput.value = shortName;
      }
    } catch {}
  }, 350);
}

function updateLocation(lat, lon, shouldReverse = false) {
  latInput.value = parseFloat(lat).toFixed(4);
  lonInput.value = parseFloat(lon).toFixed(4);

  const radius = parseFloat(distInput.value || 5) * 1000;

  if (!marker) {
    marker = L.marker([lat, lon], { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      updateLocation(pos.lat, pos.lng, true);
    });
  } else {
    marker.setLatLng([lat, lon]);
  }

  if (!radiusCircle) {
    radiusCircle = L.circle([lat, lon], {
      radius: radius,
      color: '#1f6feb',
      fillColor: '#1f6feb',
      fillOpacity: 0.15
    }).addTo(map);
  } else {
    radiusCircle.setLatLng([lat, lon]).setRadius(radius);
  }

  if (map) map.panTo([lat, lon]);

  if (shouldReverse) {
    reverseGeocode(lat, lon);
  }
}

if (distInput) {
  distInput.addEventListener('input', () => {
    const radius = parseFloat(distInput.value || 0) * 1000;
    if (radiusCircle) radiusCircle.setRadius(radius);
  });
}

async function searchLocation() {
  const query = addressInput.value.trim();
  if (!query) return;

  searchAddressBtn.textContent = 'Searching...';
  searchAddressBtn.disabled = true;

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data && data.length > 0) {
      const { lat, lon, display_name } = data[0];
      const parts = display_name.split(',').map(p => p.trim());
      addressInput.value = parts.slice(0, 3).join(', ');

      updateLocation(lat, lon, false);
      map.setView([lat, lon], 12);
    } else {
      alert('Location not found. Try a broader city or postal name.');
    }
  } catch (err) {
    alert('Failed to contact search service.');
  } finally {
    searchAddressBtn.textContent = 'Search';
    searchAddressBtn.disabled = false;
  }
}

if (searchAddressBtn) searchAddressBtn.addEventListener('click', searchLocation);

if (addressInput) {
  addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchLocation();
    }
  });
}

window.electronAPI.getConfig().then((config) => {
  if (config && typeof config.notificationsEnabled === 'boolean') {
    notificationsActive = config.notificationsEnabled;
    if (soundBtn) {
      soundBtn.textContent = notificationsActive ? '🔔' : '🔕';
      soundBtn.title = notificationsActive ? 'Notifications Enabled' : 'Notifications Muted';
    }
  }

  const hasConfig = config && config.lat != null && config.lon != null;

  if (hasConfig) {
    latInput.value = config.lat;
    lonInput.value = config.lon;
    distInput.value = config.maxDist;
    statusText.textContent = `Monitoring: ${config.lat}, ${config.lon} (${config.maxDist} km)`;
    statusText.style.color = '#00d26a';
    initMap(config.lat, config.lon, config.maxDist);
  } else {
    distInput.value = (config && config.maxDist) ? config.maxDist : 5;
    statusText.textContent = 'No location configured. Open settings to begin.';
    statusText.style.color = '#e3b341';
    initMap(null, null, 5);
    settingsPanel.classList.remove('hidden');
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 200);
  }
});

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const config = {
    lat: parseFloat(latInput.value),
    lon: parseFloat(lonInput.value),
    maxDist: parseFloat(distInput.value)
  };

  container.innerHTML = '<div class="empty-state">No flights detected for the new location yet.</div>';
  totalFlights = 0;
  flightCount.textContent = '0';

  window.electronAPI.saveConfig(config);
  statusText.textContent = `Monitoring: ${config.lat}, ${config.lon} (${config.maxDist} km)`;
  statusText.style.color = '#00d26a';

  settingsPanel.classList.add('hidden');
});

window.electronAPI.onNewFlight((flight) => {
  if (flight.playSound) {
    alertAudio.currentTime = 0;
    alertAudio.play().catch(() => {});
  }

  const emptyState = container.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const card = document.createElement('div');
  card.className = 'flight-card';

  card.innerHTML = `
    <div class="flight-left">
      <img class="airline-badge" src="${flight.imagePath}" alt="${flight.airlineName}">
      <div class="flight-meta">
        <div class="flight-title-row">
          <strong>${flight.airlineName} (${flight.callsign || 'No callsign'})</strong>
          <span class="flight-timestamp">${flight.detectedAt}</span>
        </div>
        <span>Route: ${flight.route} | Dist: ${flight.distKm} km | Alt: ${flight.altKm} km</span>
      </div>
    </div>
    <button class="radar-btn" type="button">Track Radar</button>
  `;

  card.querySelector('.radar-btn').addEventListener('click', () => {
    window.electronAPI.openRadar(flight.trackingUrl);
  });

  container.prepend(card);

  totalFlights += 1;
  flightCount.textContent = totalFlights.toString();
});