const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ProcessManager = require('./src/processes');

let mainWindow;
let processManager;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 620,
        minWidth: 800,
        minHeight: 560,
        resizable: true,
        frame: false,
        transparent: false,
        backgroundColor: '#0a0a0f',
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

    // Init process manager with the window reference
    processManager = new ProcessManager(mainWindow);

    // Open devtools in dev mode
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// --- Window control handlers ---
ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow) {
        mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    }
});

ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
});

// --- Connection handlers ---
ipcMain.handle('connect', async () => {
    try {
        await processManager.connect();
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('disconnect', async () => {
    try {
        await processManager.disconnect();
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// --- App lifecycle ---
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (processManager) processManager.cleanup();
    app.quit();
});

app.on('before-quit', () => {
    if (processManager) processManager.cleanup();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
