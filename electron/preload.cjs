const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('aios', Object.freeze({
  request: (operation, args = {}) => ipcRenderer.invoke('aios:request', operation, args),
  lab: (operation, args = {}) => ipcRenderer.invoke('aios:lab', operation, args),
  pickFiles: () => ipcRenderer.invoke('aios:pick-files'),
  dropFiles: files => ipcRenderer.invoke('aios:drop-files', Array.from(files).map(file => webUtils.getPathForFile(file))),
  saveArtifact: args => ipcRenderer.invoke('aios:save-artifact', args),
  onLabProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('aios:lab-progress', listener);
    return () => ipcRenderer.removeListener('aios:lab-progress', listener);
  },
  pickFolder: () => ipcRenderer.invoke('aios:pick-folder'),
  openLink: url => ipcRenderer.invoke('aios:open-link', url),
  copyText: text => ipcRenderer.invoke('aios:copy', text),
  cancelScan: () => ipcRenderer.invoke('aios:cancel-scan'),
  onProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('aios:progress', listener);
    return () => ipcRenderer.removeListener('aios:progress', listener);
  },
}));
