const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aios', Object.freeze({
  request: (operation, args = {}) => ipcRenderer.invoke('aios:request', operation, args),
  pickFolder: () => ipcRenderer.invoke('aios:pick-folder'),
  copyText: text => ipcRenderer.invoke('aios:copy', text),
  cancelScan: () => ipcRenderer.invoke('aios:cancel-scan'),
  onProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('aios:progress', listener);
    return () => ipcRenderer.removeListener('aios:progress', listener);
  },
}));
