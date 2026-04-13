// ========================================
// BillPlay — Process Manager
// Manages the lifecycle of the tsnet sidecar
// and lan-play child processes.
// ========================================

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// --- Configuration ---
const HOMELAB_IP = "100.64.0.2";
const LANPLAY_PORT = "11451";
const LANPLAY_SERVER = `${HOMELAB_IP}:${LANPLAY_PORT}`;

// Auth key injected at build time via .env
const AUTH_KEY = process.env.TS_AUTH_KEY || '';
const CONTROL_URL = process.env.TS_CONTROL_URL || '';

class ProcessManager {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.sidecarProcess = null;
        this.lanPlayProcess = null;
        this.isConnected = false;
        this.isConnecting = false;
    }

    // --- Resolve binary paths ---
    _getBinPath(name) {
        const platform = os.platform();
        const arch = os.arch();

        let suffix = '';
        if (platform === 'win32') {
            suffix = '.exe';
        }

        // In development, look in sidecar/ build output or bin/
        const devPath = path.join(__dirname, 'sidecar', name);
        const binPath = path.join(__dirname, 'bin', `${name}-${platform}-${arch}${suffix}`);
        const binFallback = path.join(__dirname, 'bin', `${name}${suffix}`);

        // Try in order: platform-specific binary, generic binary, dev build
        for (const p of [binPath, binFallback, devPath]) {
            if (fs.existsSync(p)) {
                return p;
            }
        }

        return binPath; // Will fail with a clear error
    }

    // --- Send messages to renderer ---
    _sendStatus(type, status, message) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('status-update', { type, status, message });
        }
    }

    _sendLog(message, level = 'info') {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('log', { message, level });
        }
    }

    // --- Start VPN Sidecar ---
    async _startSidecar() {
        return new Promise((resolve, reject) => {
            const sidecarPath = this._getBinPath('ts-sidecar');

            if (!fs.existsSync(sidecarPath)) {
                const err = `Sidecar binary not found: ${sidecarPath}`;
                this._sendLog(err, 'error');
                return reject(new Error(err));
            }

            if (!AUTH_KEY) {
                const err = 'No auth key configured. Set TS_AUTH_KEY environment variable.';
                this._sendLog(err, 'error');
                return reject(new Error(err));
            }

            const args = ['--key', AUTH_KEY];
            if (CONTROL_URL) {
                args.push('--server', CONTROL_URL);
            }

            this._sendLog(`Starting VPN sidecar...`, 'vpn');
            this._sendStatus('vpn', 'connecting', 'Conectando...');

            this.sidecarProcess = spawn(sidecarPath, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let resolved = false;

            this.sidecarProcess.stdout.on('data', (data) => {
                const lines = data.toString().trim().split('\n');
                for (const line of lines) {
                    this._parseSidecarOutput(line);

                    // Resolve the promise when connected
                    if (!resolved && line.includes('STATUS:CONNECTED')) {
                        resolved = true;
                        resolve();
                    }
                }
            });

            this.sidecarProcess.stderr.on('data', (data) => {
                this._sendLog(`[SIDECAR STDERR] ${data.toString().trim()}`, 'warning');
            });

            this.sidecarProcess.on('error', (err) => {
                this._sendLog(`Sidecar error: ${err.message}`, 'error');
                this._sendStatus('vpn', 'error', 'Erro');
                if (!resolved) {
                    resolved = true;
                    reject(err);
                }
            });

            this.sidecarProcess.on('close', (code) => {
                this._sendLog(`Sidecar process exited (code: ${code})`, code === 0 ? 'info' : 'error');
                this.sidecarProcess = null;
                this._sendStatus('vpn', 'error', 'Desconectado');

                // If we never connected, reject
                if (!resolved) {
                    resolved = true;
                    reject(new Error(`Sidecar exited with code ${code}`));
                }
            });

            // Timeout after 60s
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    reject(new Error('Sidecar connection timeout (60s)'));
                }
            }, 60000);
        });
    }

    // --- Parse sidecar stdout protocol ---
    _parseSidecarOutput(line) {
        if (line.startsWith('STATUS:')) {
            const status = line.substring(7);

            if (status === 'CONNECTING') {
                this._sendStatus('vpn', 'connecting', 'Conectando...');
            } else if (status === 'CONNECTED') {
                this._sendStatus('vpn', 'active', 'Ativa');
            } else if (status === 'DISCONNECTING') {
                this._sendStatus('vpn', 'pending', 'Desconectando...');
            } else if (status === 'DISCONNECTED') {
                this._sendStatus('vpn', 'error', 'Desconectada');
            } else if (status.startsWith('ERROR:')) {
                const msg = status.substring(6);
                this._sendStatus('vpn', 'error', msg);
                this._sendLog(`VPN Error: ${msg}`, 'error');
            }
        } else if (line.startsWith('LOG:')) {
            this._sendLog(line.substring(4), 'vpn');
        }
    }

    // --- Start LAN Play ---
    _startLanPlay() {
        return new Promise((resolve, reject) => {
            const lanPlayPath = this._getBinPath('lan-play');

            if (!fs.existsSync(lanPlayPath)) {
                const err = `lan-play binary not found: ${lanPlayPath}`;
                this._sendLog(err, 'error');
                return reject(new Error(err));
            }

            this._sendLog(`Starting LAN Play → ${LANPLAY_SERVER}`, 'info');
            this._sendStatus('lanplay', 'connecting', 'Iniciando...');

            this.lanPlayProcess = spawn(lanPlayPath, [
                '--relay-server-addr', LANPLAY_SERVER
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.lanPlayProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                this._sendLog(`[LAN-PLAY] ${output}`, 'info');

                // Detect when lan-play is ready
                if (output.includes('listening') || output.includes('connected') || output.includes('Ready')) {
                    this._sendStatus('lanplay', 'active', 'Ativo');
                    resolve();
                }
            });

            this.lanPlayProcess.stderr.on('data', (data) => {
                this._sendLog(`[LAN-PLAY] ${data.toString().trim()}`, 'warning');
            });

            this.lanPlayProcess.on('error', (err) => {
                this._sendLog(`LAN Play error: ${err.message}`, 'error');
                this._sendStatus('lanplay', 'error', 'Erro');
                reject(err);
            });

            this.lanPlayProcess.on('close', (code) => {
                this._sendLog(`LAN Play exited (code: ${code})`, code === 0 ? 'info' : 'error');
                this.lanPlayProcess = null;
                this._sendStatus('lanplay', 'error', 'Parado');
            });

            // Resolve after 3s if no explicit ready signal
            setTimeout(() => resolve(), 3000);
        });
    }

    // --- Connect (orchestrate both processes) ---
    async connect() {
        if (this.isConnected || this.isConnecting) return;
        this.isConnecting = true;

        try {
            // Step 1: Start VPN
            this._sendStatus('server', 'pending', `${LANPLAY_SERVER}`);
            await this._startSidecar();

            // Step 2: Start LAN Play
            await this._startLanPlay();

            // All good
            this.isConnected = true;
            this.isConnecting = false;
            this._sendStatus('server', 'active', LANPLAY_SERVER);
            this._sendStatus('global', 'connected', 'Conectado');
        } catch (err) {
            this.isConnecting = false;
            this._sendStatus('global', 'error', err.message);
            await this.disconnect();
            throw err;
        }
    }

    // --- Disconnect (kill both processes) ---
    async disconnect() {
        this._sendLog('Shutting down...', 'warning');

        if (this.lanPlayProcess) {
            this.lanPlayProcess.kill('SIGTERM');
            this.lanPlayProcess = null;
        }

        if (this.sidecarProcess) {
            this.sidecarProcess.kill('SIGTERM');
            this.sidecarProcess = null;
        }

        this.isConnected = false;
        this.isConnecting = false;
        this._sendStatus('global', 'disconnected', 'Desconectado');
    }

    // --- Cleanup on app quit ---
    cleanup() {
        if (this.lanPlayProcess) {
            this.lanPlayProcess.kill('SIGKILL');
        }
        if (this.sidecarProcess) {
            this.sidecarProcess.kill('SIGKILL');
        }
    }
}

module.exports = ProcessManager;
