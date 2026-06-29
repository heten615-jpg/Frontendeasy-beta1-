'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('frontendeasyNative', {
  isElectron: true,
  pickFolder: () => ipcRenderer.invoke('frontendeasy:pickFolder'),
  getLastFolder: () => ipcRenderer.invoke('frontendeasy:getLastFolder'),
  writeFiles: (folderPath, files) =>
    ipcRenderer.invoke('frontendeasy:writeFiles', { folderPath, files }),
});
