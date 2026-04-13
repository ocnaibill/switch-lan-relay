// ========================================
// SwitchPlay — Process Manager
// Manages the lifecycle of the tsnet sidecar
// and lan-play child processes.
//
// O sidecar Go é lançado como child_process oculto.
// A comunicação é feita via stdout com marcadores:
//   [VPN_CONNECTED] <ip>  → VPN ativa
//   [VPN_ERROR] <msg>     → Erro
//   [LOG] <msg>           → Log genérico
// ========================================

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const NpcapDetector = require('./npcap');

// ==========================================
// Configuração Hardcoded — Zero-Config
// ==========================================
const HOMELAB_IP = "100.64.0.2";
const LANPLAY_PORT = "11451";
const LANPLAY_SERVER = `${HOMELAB_IP}:${LANPLAY_PORT}`;

class ProcessManager {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.sidecarProcess = null;
        this.lanPlayProcess = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.vpnIP = null;            // IP recebido da Tailnet (100.64.x.x)
        this.npcap = new NpcapDetector(mainWindow);
    }

    // --- Resolve binary paths ---
    // Procura o binário em várias localizações:
    // Resolve binary paths for both DEVELOPMENT and PACKAGED modes.
    //
    // Empacotado (electron-builder):
    //   Os binários ficam em process.resourcesPath/bin/
    //   Ex: SwitchPlay.app/Contents/Resources/bin/ts-sidecar-darwin-arm64
    //
    // Desenvolvimento:
    //   Os binários ficam em client/bin/ ou client/sidecar/
    _getBinPath(name) {
        const platform = os.platform();
        const arch = os.arch();
        const isPackaged = require('electron').app?.isPackaged ?? false;

        let suffix = '';
        if (platform === 'win32') {
            suffix = '.exe';
        }

        // Mapear nomes do Go (GOOS/GOARCH) para os nomes do Node
        // Go usa "amd64" mas Node usa "x64"
        const goArch = arch === 'x64' ? 'amd64' : arch;

        // Lista de caminhos a tentar, em ordem de prioridade
        const candidates = [];

        if (isPackaged) {
            // Modo empacotado: binários em Resources/bin/
            const resPath = process.resourcesPath;
            candidates.push(path.join(resPath, 'bin', `${name}-${platform}-${goArch}${suffix}`));
            candidates.push(path.join(resPath, 'bin', `${name}${suffix}`));
        }

        // Modo dev: binários em client/bin/ ou client/sidecar/
        candidates.push(path.join(__dirname, '..', 'bin', `${name}-${platform}-${goArch}${suffix}`));
        candidates.push(path.join(__dirname, '..', 'bin', `${name}${suffix}`));
        candidates.push(path.join(__dirname, '..', 'sidecar', `${name}${suffix}`));

        for (const p of candidates) {
            if (fs.existsSync(p)) {
                return p;
            }
        }

        return candidates[0]; // Will fail with a clear error message
    }

    // --- Send messages to renderer via IPC ---
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

    // ==========================================
    // SIDECAR VPN (Go tsnet)
    // ==========================================
    // Inicia o binário Go como child_process oculto.
    // Lê o stdout linha por linha; quando detecta
    // [VPN_CONNECTED], resolve a Promise e notifica a UI.
    async _startSidecar() {
        return new Promise((resolve, reject) => {
            const sidecarPath = this._getBinPath('ts-sidecar');

            // Verificar se o binário existe
            if (!fs.existsSync(sidecarPath)) {
                const err = `Binário sidecar não encontrado: ${sidecarPath}`;
                this._sendLog(err, 'error');
                return reject(new Error(err));
            }

            this._sendLog('Iniciando VPN sidecar (tsnet)...', 'vpn');
            this._sendStatus('vpn', 'connecting', 'Conectando...');

            // Spawn do binário Go de forma OCULTA (windowsHide)
            // O sidecar não precisa de argumentos — tudo é hardcoded
            this.sidecarProcess = spawn(sidecarPath, [], {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true    // Esconde a janela do console no Windows
            });

            let resolved = false;

            // --- Ler stdout do sidecar linha por linha ---
            this.sidecarProcess.stdout.on('data', (data) => {
                const lines = data.toString().trim().split('\n');
                for (const line of lines) {
                    this._parseSidecarOutput(line);

                    // Quando detectar [VPN_CONNECTED], a VPN está ativa
                    if (!resolved && line.includes('[VPN_CONNECTED]')) {
                        resolved = true;

                        // Extrair o IP da linha: "[VPN_CONNECTED] 100.64.x.x"
                        const parts = line.split(' ');
                        if (parts.length > 1) {
                            this.vpnIP = parts[1];
                        }

                        resolve();
                    }
                }
            });

            this.sidecarProcess.stderr.on('data', (data) => {
                this._sendLog(`[SIDECAR] ${data.toString().trim()}`, 'warning');
            });

            this.sidecarProcess.on('error', (err) => {
                this._sendLog(`Erro ao iniciar sidecar: ${err.message}`, 'error');
                this._sendStatus('vpn', 'error', 'Erro');
                if (!resolved) {
                    resolved = true;
                    reject(err);
                }
            });

            this.sidecarProcess.on('close', (code) => {
                this._sendLog(
                    `Sidecar encerrado (código: ${code})`,
                    code === 0 ? 'info' : 'error'
                );
                this.sidecarProcess = null;
                this.vpnIP = null;
                this._sendStatus('vpn', 'error', 'Desconectado');

                if (!resolved) {
                    resolved = true;
                    reject(new Error(`Sidecar encerrou com código ${code}`));
                }
            });

            // Timeout de 60s para a conexão
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    reject(new Error('Timeout de conexão VPN (60s)'));
                }
            }, 60000);
        });
    }

    // --- Interpretar stdout do sidecar ---
    // Protocolo: [VPN_CONNECTING], [VPN_CONNECTED] ip, [VPN_ERROR] msg, [LOG] msg
    _parseSidecarOutput(line) {
        if (line.includes('[VPN_CONNECTING]')) {
            this._sendStatus('vpn', 'connecting', 'Conectando...');

        } else if (line.includes('[VPN_CONNECTED]')) {
            const ip = line.split(' ')[1] || '';
            this._sendStatus('vpn', 'active', `Ativa (${ip})`);
            this._sendLog(`VPN conectada! IP na Tailnet: ${ip}`, 'success');

        } else if (line.includes('[VPN_ERROR]')) {
            const msg = line.replace(/.*\[VPN_ERROR\]\s*/, '');
            this._sendStatus('vpn', 'error', msg);
            this._sendLog(`VPN Erro: ${msg}`, 'error');

        } else if (line.includes('[VPN_DISCONNECTED]')) {
            this._sendStatus('vpn', 'error', 'Desconectada');
            this._sendLog('VPN desconectada.', 'warning');

        } else if (line.includes('[LOG]')) {
            const msg = line.replace(/.*\[LOG\]\s*/, '');
            this._sendLog(msg, 'vpn');
        }
    }

    // ==========================================
    // LAN PLAY
    // ==========================================
    _startLanPlay() {
        return new Promise((resolve, reject) => {
            const lanPlayPath = this._getBinPath('lan-play');

            if (!fs.existsSync(lanPlayPath)) {
                const err = `Binário lan-play não encontrado: ${lanPlayPath}`;
                this._sendLog(err, 'error');
                return reject(new Error(err));
            }

            this._sendLog(`Iniciando LAN Play → ${LANPLAY_SERVER}`, 'info');
            this._sendStatus('lanplay', 'connecting', 'Iniciando...');

            this.lanPlayProcess = spawn(lanPlayPath, [
                '--relay-server-addr', LANPLAY_SERVER
            ], {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true
            });

            this.lanPlayProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                this._sendLog(`[LAN-PLAY] ${output}`, 'info');

                if (output.includes('listening') || output.includes('connected') || output.includes('Ready') || output.includes('pcap loop start') || output.includes('Server IP')) {
                    this._sendStatus('lanplay', 'active', 'Ativo');
                    resolve();
                }
            });

            this.lanPlayProcess.stderr.on('data', (data) => {
                this._sendLog(`[LAN-PLAY] ${data.toString().trim()}`, 'warning');
            });

            this.lanPlayProcess.on('error', (err) => {
                this._sendLog(`LAN Play erro: ${err.message}`, 'error');
                this._sendStatus('lanplay', 'error', 'Erro');
                reject(err);
            });

            this.lanPlayProcess.on('close', (code) => {
                this._sendLog(
                    `LAN Play encerrado (código: ${code})`,
                    code === 0 ? 'info' : 'error'
                );
                this.lanPlayProcess = null;
                this._sendStatus('lanplay', 'error', 'Parado');
            });

            // Resolve após 3s se não houver sinal explícito de ready
            setTimeout(() => {
                this._sendStatus('lanplay', 'active', 'Ativo');
                resolve();
            }, 3000);
        });
    }

    // ==========================================
    // ORQUESTRAÇÃO — Conectar
    // ==========================================
    // Sequência: VPN → Npcap check → LAN Play
    async connect() {
        if (this.isConnected || this.isConnecting) return;
        this.isConnecting = true;

        try {
            // Passo 1: Iniciar VPN invisível (tsnet sidecar)
            this._sendStatus('server', 'pending', LANPLAY_SERVER);
            await this._startSidecar();

            // Passo 2: Verificar Npcap (apenas Windows)
            const npcapOk = await this.npcap.ensure();
            if (!npcapOk) {
                throw new Error('Npcap é necessário mas não pôde ser instalado.');
            }

            // Passo 3: Iniciar LAN Play apontando para o servidor
            await this._startLanPlay();

            // Tudo OK — notificar a UI
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

    // ==========================================
    // ORQUESTRAÇÃO — Desconectar
    // ==========================================
    async disconnect() {
        this._sendLog('Encerrando processos...', 'warning');

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
        this.vpnIP = null;
        this._sendStatus('global', 'disconnected', 'Desconectado');
    }

    // --- Cleanup forçado ao fechar o app ---
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
