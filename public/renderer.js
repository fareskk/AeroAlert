const toggleBtn = document.getElementById('toggle-settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const cancelBtn = document.getElementById('cancel-btn');
const form = document.getElementById('config-form');
const autoLocationBtn = document.getElementById('auto-location-btn');
const quickPresets = document.getElementById('quick-presets');

const latInput = document.getElementById('lat');
const lonInput = document.getElementById('lon');
const distInput = document.getElementById('dist');
const statusText = document.getElementById('status-text');
const flightCount = document.getElementById('flight-count');
const container = document.getElementById('flights-container');

let totalFlights = 0;

function toggleDrawer() {
  settingsPanel.classList.toggle('hidden');
}

toggleBtn.addEventListener('click', toggleDrawer);
cancelBtn.addEventListener('click', toggleDrawer);

autoLocationBtn.addEventListener('click', async () => {
  autoLocationBtn.textContent = 'Locating...';

  const result = await window.electronAPI.getCurrentLocation();

  if (result.success) {
    latInput.value = result.lat.toFixed(4);
    lonInput.value = result.lon.toFixed(4);
    if (!distInput.value) distInput.value = '5';
    autoLocationBtn.textContent = `Found (${result.city})!`;
    setTimeout(() => {
      autoLocationBtn.textContent = 'Use My Location';
    }, 2500);
  } else {
    alert(`Failed to retrieve location: ${result.error}`);
    autoLocationBtn.textContent = 'Use My Location';
  }
});

quickPresets.addEventListener('change', (event) => {
  const [lat, lon] = event.target.value.split(',');
  latInput.value = lat;
  lonInput.value = lon;
  if (!distInput.value) distInput.value = '4';
});

window.electronAPI.getConfig().then((config) => {
  if (config) {
    latInput.value = config.lat;
    lonInput.value = config.lon;
    distInput.value = config.maxDist;
    statusText.textContent = `Monitoring: ${config.lat}, ${config.lon} (${config.maxDist} km)`;
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

  settingsPanel.classList.add('hidden');
});

window.electronAPI.onNewFlight((flight) => {
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const card = document.createElement('div');
  card.className = 'flight-card';

  card.innerHTML = `
    <div class="flight-left">
      <img class="airline-badge" src="${flight.imagePath}" alt="${flight.airlineName}">
      <div class="flight-meta">
        <strong>${flight.airlineName} (${flight.callsign || 'No callsign'})</strong>
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