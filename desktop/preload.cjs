const { contextBridge, ipcRenderer } = require('electron');
const subscribe = channel => callback => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('clearspaceDesktop', {
  getState: () => ipcRenderer.invoke('desktop:state'),
  save: value => ipcRenderer.invoke('desktop:save', value),
  reset: () => ipcRenderer.invoke('desktop:reset'),
  openReader: () => ipcRenderer.invoke('desktop:reader'),
  readClipboard: () => ipcRenderer.invoke('desktop:clipboard'),
  setReader: text => ipcRenderer.invoke('desktop:set-reader', text),
  openSystemSettings: section => ipcRenderer.invoke('desktop:system-settings', section),
  requestAccessibility: () => ipcRenderer.invoke('desktop:accessibility'),
  retryEffect: name => ipcRenderer.invoke('desktop:retry-effect', name),
  requestScreenCapture: () => ipcRenderer.invoke('desktop:capture-permission'),
  installCompanion: (browser, extensionId) => ipcRenderer.invoke('desktop:install-companion', { browser, extensionId }),
  showCompanion: () => ipcRenderer.invoke('desktop:show-companion'),
  login: () => ipcRenderer.invoke('desktop:login'),
  logout: () => ipcRenderer.invoke('desktop:logout'),
  syncNow: () => ipcRenderer.invoke('desktop:sync'),
  onState: subscribe('desktop:state-changed'),
  onReader: subscribe('desktop:reader-changed'),
});
