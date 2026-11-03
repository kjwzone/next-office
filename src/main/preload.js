// 화면이 쓸 수 있는 메인 프로세스 기능만 골라 내보내는 preload 스크립트
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nextOffice', {
  openDocument: () => ipcRenderer.invoke('file:open'),
  commitOpen: () => ipcRenderer.invoke('file:commit-open'),
  startNewDocument: () => ipcRenderer.invoke('file:new'),
  saveDocument: (bytes) => ipcRenderer.invoke('file:save', bytes),
  saveDocumentAs: (bytes) => ipcRenderer.invoke('file:save-as', bytes),
  askUnsaved: () => ipcRenderer.invoke('dialog:unsaved'),
  showError: (message) => ipcRenderer.invoke('dialog:error', message),
  setTitle: (title) => ipcRenderer.invoke('window:set-title', title),
  confirmClose: () => ipcRenderer.invoke('window:confirm-close'),
  print: () => ipcRenderer.invoke('window:print'),
  onCommand: (listener) => ipcRenderer.on('shell:command', (_event, command) => listener(command)),
  onCloseRequested: (listener) => ipcRenderer.on('shell:close-requested', () => listener()),
});
