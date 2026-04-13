// ========================================
// BillPlay — Renderer Process
// Handles UI interactions and status updates
// ========================================

// --- DOM Elements ---
const elements = {
    // Titlebar
    btnMinimize: document.getElementById('btn-minimize'),
    btnMaximize: document.getElementById('btn-maximize'),
    btnClose: document.getElementById('btn-close'),

    // Status
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    vpnStatus: document.getElementById('vpn-status'),
    lanplayStatus: document.getElementById('lanplay-status'),
    serverStatus: document.getElementById('server-status'),

    // Action
    btnConnect: document.getElementById('btn-connect'),
    btnConnectText: document.getElementById('btn-connect-text'),
    btnSpinner: document.getElementById('btn-spinner'),

    // Log
    logOutput: document.getElementById('log-output'),
    btnClearLog: document.getElementById('btn-clear-log')
};

// --- State ---
let isConnected = false;
let isConnecting = false;

// --- Window Controls ---
elements.btnMinimize.addEventListener('click', () => window.billplay.minimize());
elements.btnMaximize.addEventListener('click', () => window.billplay.maximize());
elements.btnClose.addEventListener('click', () => window.billplay.close());

// --- Connect/Disconnect ---
elements.btnConnect.addEventListener('click', async () => {
    if (isConnecting) return;

    if (isConnected) {
        setUIState('disconnecting');
        try {
            await window.billplay.disconnect();
            setUIState('disconnected');
        } catch (err) {
            addLog(`Erro ao desconectar: ${err}`, 'error');
            setUIState('disconnected');
        }
    } else {
        setUIState('connecting');
        try {
            await window.billplay.connect();
            // The actual "connected" state comes from status-update events
        } catch (err) {
            addLog(`Erro ao conectar: ${err}`, 'error');
            setUIState('disconnected');
        }
    }
});

// --- Status Updates from Main Process ---
window.billplay.onStatusUpdate((data) => {
    switch (data.type) {
        case 'vpn':
            updateServiceStatus('vpn', data.status, data.message);
            break;
        case 'lanplay':
            updateServiceStatus('lanplay', data.status, data.message);
            break;
        case 'server':
            updateServiceStatus('server', data.status, data.message);
            break;
        case 'global':
            if (data.status === 'connected') {
                setUIState('connected');
            } else if (data.status === 'disconnected') {
                setUIState('disconnected');
            } else if (data.status === 'error') {
                setUIState('disconnected');
                addLog(data.message || 'Erro de conexão', 'error');
            }
            break;
    }
});

// --- Log Stream ---
window.billplay.onLog((data) => {
    addLog(data.message, data.level || 'info');
});

// --- Clear Log ---
elements.btnClearLog.addEventListener('click', () => {
    elements.logOutput.innerHTML = '';
    addLog('Console limpo.', 'info');
});

// --- UI State Machine ---
function setUIState(state) {
    switch (state) {
        case 'disconnected':
            isConnected = false;
            isConnecting = false;
            elements.statusDot.className = '';
            elements.statusText.textContent = 'Desconectado';
            elements.btnConnect.className = 'btn-primary';
            elements.btnConnectText.textContent = 'Conectar';
            elements.btnSpinner.classList.add('hidden');
            resetServiceStatuses();
            break;

        case 'connecting':
            isConnected = false;
            isConnecting = true;
            elements.statusDot.className = 'connecting';
            elements.statusText.textContent = 'Conectando...';
            elements.btnConnect.className = 'btn-primary connecting';
            elements.btnConnectText.textContent = 'Conectando';
            elements.btnSpinner.classList.remove('hidden');
            addLog('Iniciando conexão...', 'info');
            break;

        case 'connected':
            isConnected = true;
            isConnecting = false;
            elements.statusDot.className = 'connected';
            elements.statusText.textContent = 'Conectado';
            elements.btnConnect.className = 'btn-primary connected';
            elements.btnConnectText.textContent = 'Desconectar';
            elements.btnSpinner.classList.add('hidden');
            addLog('🎮 Pronto para jogar!', 'success');
            break;

        case 'disconnecting':
            isConnecting = true;
            elements.statusDot.className = 'connecting';
            elements.statusText.textContent = 'Desconectando...';
            elements.btnConnect.className = 'btn-primary connecting';
            elements.btnConnectText.textContent = 'Desconectando';
            elements.btnSpinner.classList.remove('hidden');
            addLog('Encerrando processos...', 'warning');
            break;
    }
}

// --- Service Status Updates ---
function updateServiceStatus(service, status, message) {
    const el = elements[`${service}Status`];
    if (!el) return;

    el.textContent = message || status;
    el.className = 'detail-value';

    if (status === 'active' || status === 'connected') {
        el.classList.add('active');
    } else if (status === 'pending' || status === 'connecting') {
        el.classList.add('pending');
    } else if (status === 'error') {
        el.classList.add('error');
    }

    // Log the event
    const logLevel = status === 'error' ? 'error' :
                     status === 'active' ? 'success' :
                     service === 'vpn' ? 'vpn' : 'info';
    addLog(`[${service.toUpperCase()}] ${message || status}`, logLevel);
}

function resetServiceStatuses() {
    elements.vpnStatus.textContent = '—';
    elements.vpnStatus.className = 'detail-value';
    elements.lanplayStatus.textContent = '—';
    elements.lanplayStatus.className = 'detail-value';
    elements.serverStatus.textContent = '—';
    elements.serverStatus.className = 'detail-value';
}

// --- Log Helper ---
function addLog(message, level = 'info') {
    const entry = document.createElement('p');
    entry.className = `log-entry log-${level}`;

    const timestamp = new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    entry.textContent = `[${timestamp}] ${message}`;
    elements.logOutput.appendChild(entry);

    // Auto-scroll to bottom
    elements.logOutput.scrollTop = elements.logOutput.scrollHeight;

    // Keep max 200 entries
    while (elements.logOutput.children.length > 200) {
        elements.logOutput.removeChild(elements.logOutput.firstChild);
    }
}

// --- Initial State ---
addLog('Aguardando ação do utilizador...', 'info');
