const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onNewFlight: (callback) => ipcRenderer.on('new-flight', (_event, flightData) => callback(flightData)),
  openRadar: (url) => ipcRenderer.send('open-radar', url),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.send('save-config', config),
  getCurrentLocation: () => ipcRenderer.invoke('get-current-location')
});