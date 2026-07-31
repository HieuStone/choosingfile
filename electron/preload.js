import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  openDirectory: (title) => ipcRenderer.invoke('dialog:openDirectory', title),
  scanDirectory: (params) => ipcRenderer.invoke('fs:scanDirectory', params),
  processFiles: (params) => ipcRenderer.invoke('fs:processFiles', params),
  openFolder: (folderPath) => ipcRenderer.invoke('shell:openFolder', folderPath),
  onProgress: (callback) => {
    const subscription = (event, data) => callback(data)
    ipcRenderer.on('process:progress', subscription)
    return () => {
      ipcRenderer.removeListener('process:progress', subscription)
    }
  },
})
