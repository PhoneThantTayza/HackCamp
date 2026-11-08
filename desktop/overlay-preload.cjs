const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('clearspaceOverlay', {
  onFrame(callback) { ipcRenderer.on('overlay:frame', (_event, value) => callback(value)); },
});
