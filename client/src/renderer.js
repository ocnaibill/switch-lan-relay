// ========================================
// SwitchPlay — Renderer Process
// Handles UI interactions and status updates
// ========================================

// --- DOM Elements ---
const elements = {
  // Titlebar
  btnMinimize: document.getElementById("btn-minimize"),
  btnMaximize: document.getElementById("btn-maximize"),
  btnClose: document.getElementById("btn-close"),

  // Status
  statusDot: document.getElementById("status-dot"),
  statusText: document.getElementById("status-text"),
  vpnStatus: document.getElementById("vpn-status"),
  lanplayStatus: document.getElementById("lanplay-status"),
  serverStatus: document.getElementById("server-status"),

  // Action
  btnConnect: document.getElementById("btn-connect"),
  btnConnectText: document.getElementById("btn-connect-text"),
  btnSpinner: document.getElementById("btn-spinner"),

  // Log
  logOutput: document.getElementById("log-output"),
  btnClearLog: document.getElementById("btn-clear-log"),

  // Transmitter
  btnTransmitter: document.getElementById("btn-transmitter"),
  transmitterPanel: document.getElementById("transmitter-panel"),
  transmitterIpValue: document.getElementById("transmitter-ip-value"),
  transmitterSteps: document.getElementById("transmitter-steps"),

  // Settings
  inputControlUrl: document.getElementById("input-controlurl"),
  inputAuthKey: document.getElementById("input-authkey"),
  inputLanPlay: document.getElementById("input-lanplay"),
};

// --- State ---
let isConnected = false;
let isConnecting = false;
let transmitterActive = false;

// --- Load Settings ---
function loadSettings() {
  elements.inputControlUrl.value = localStorage.getItem("sp_control_url") || "";
  elements.inputAuthKey.value = localStorage.getItem("sp_auth_key") || "";
  elements.inputLanPlay.value =
    localStorage.getItem("sp_lan_play") || "100.64.0.2:11451";
}

function saveSettings() {
  localStorage.setItem("sp_control_url", elements.inputControlUrl.value.trim());
  localStorage.setItem("sp_auth_key", elements.inputAuthKey.value.trim());
  localStorage.setItem("sp_lan_play", elements.inputLanPlay.value.trim());
}

loadSettings();

// --- Window Controls ---
elements.btnMinimize.addEventListener("click", () =>
  window.switchplay.minimize(),
);
elements.btnMaximize.addEventListener("click", () =>
  window.switchplay.maximize(),
);
elements.btnClose.addEventListener("click", () => window.switchplay.close());

// --- Connect/Disconnect ---
elements.btnConnect.addEventListener("click", async () => {
  if (isConnecting) return;

  if (isConnected) {
    setUIState("disconnecting");
    try {
      await window.switchplay.disconnect();
      setUIState("disconnected");
    } catch (err) {
      addLog(
        `${window.t ? window.t("err-disconnect") : "Erro ao desconectar:"} ${err}`,
        "error",
      );
      setUIState("disconnected");
    }
  } else {
    setUIState("connecting");

    saveSettings();

    const config = {
      controlUrl: elements.inputControlUrl.value.trim(),
      authKey: elements.inputAuthKey.value.trim(),
      lanPlay: elements.inputLanPlay.value.trim() || "100.64.0.2:11451",
    };

    if (!config.controlUrl || !config.authKey) {
      addLog(
        window.t
          ? window.t("err-settings")
          : "Erro: Preencha Headscale URL e Auth Key nas configurações primeiro.",
        "error",
      );
      setUIState("disconnected");
      return;
    }

    try {
      await window.switchplay.connect(config);
      // The actual "connected" state comes from status-update events
    } catch (err) {
      addLog(
        `${window.t ? window.t("err-connect") : "Erro ao conectar:"} ${err}`,
        "error",
      );
      setUIState("disconnected");
    }
  }
});

// --- Status Updates from Main Process ---
window.switchplay.onStatusUpdate((data) => {
  switch (data.type) {
    case "vpn":
      updateServiceStatus("vpn", data.status, data.message);
      break;
    case "lanplay":
      updateServiceStatus("lanplay", data.status, data.message);
      break;
    case "server":
      updateServiceStatus("server", data.status, data.message);
      break;
    case "global":
      if (data.status === "connected") {
        setUIState("connected");
      } else if (data.status === "disconnected") {
        setUIState("disconnected");
      } else if (data.status === "error") {
        setUIState("disconnected");
        addLog(data.message || "Erro de conexão", "error");
      }
      break;
  }
});

// --- Log Stream ---
window.switchplay.onLog((data) => {
  addLog(data.message, data.level || "info");
});

// --- Clear Log ---
elements.btnClearLog.addEventListener("click", () => {
  elements.logOutput.innerHTML = "";
  addLog("Console limpo.", "info");
});

// --- UI State Machine ---
function setUIState(state) {
  switch (state) {
    case "disconnected":
      isConnected = false;
      isConnecting = false;
      elements.statusDot.className = "";
      elements.statusText.textContent = window.t
        ? window.t("status-disconnected")
        : "Desconectado";
      elements.btnConnect.className = "btn-primary";
      elements.btnConnectText.textContent = window.t
        ? window.t("btn-connect")
        : "Conectar";
      elements.btnSpinner.classList.add("hidden");
      resetServiceStatuses();
      break;

    case "connecting":
      isConnected = false;
      isConnecting = true;
      elements.statusDot.className = "connecting";
      elements.statusText.textContent = window.t
        ? window.t("btn-connecting")
        : "Conectando...";
      elements.btnConnect.className = "btn-primary connecting";
      elements.btnConnectText.textContent = window.t
        ? window.t("btn-connecting")
        : "Conectando";
      elements.btnSpinner.classList.remove("hidden");
      addLog("Iniciando conexão...", "info");
      break;

    case "connected":
      isConnected = true;
      isConnecting = false;
      elements.statusDot.className = "connected";
      elements.statusText.textContent = window.t
        ? window.t("status-connected")
        : "Conectado";
      elements.btnConnect.className = "btn-primary connected";
      elements.btnConnectText.textContent = window.t
        ? window.t("btn-disconnect")
        : "Desconectar";
      elements.btnSpinner.classList.add("hidden");
      addLog("🎮 Pronto para jogar!", "success");
      break;

    case "disconnecting":
      isConnecting = true;
      elements.statusDot.className = "connecting";
      elements.statusText.textContent = window.t
        ? window.t("btn-disconnecting")
        : "Desconectando...";
      elements.btnConnect.className = "btn-primary connecting";
      elements.btnConnectText.textContent = window.t
        ? window.t("btn-disconnecting")
        : "Desconectando";
      elements.btnSpinner.classList.remove("hidden");
      addLog("Encerrando processos...", "warning");
      break;
  }
}

// --- Service Status Updates ---
function updateServiceStatus(service, status, message) {
  const el = elements[`${service}Status`];
  if (!el) return;

  el.textContent = message || status;
  el.className = "detail-value";

  if (status === "active" || status === "connected") {
    el.classList.add("active");
  } else if (status === "pending" || status === "connecting") {
    el.classList.add("pending");
  } else if (status === "error") {
    el.classList.add("error");
  }

  // Log the event
  const logLevel =
    status === "error"
      ? "error"
      : status === "active"
        ? "success"
        : service === "vpn"
          ? "vpn"
          : "info";
  addLog(`[${service.toUpperCase()}] ${message || status}`, logLevel);
}

function resetServiceStatuses() {
  elements.vpnStatus.textContent = "—";
  elements.vpnStatus.className = "detail-value";
  elements.lanplayStatus.textContent = "—";
  elements.lanplayStatus.className = "detail-value";
  elements.serverStatus.textContent = "—";
  elements.serverStatus.className = "detail-value";
}

// --- Log Helper ---
function addLog(message, level = "info") {
  const entry = document.createElement("p");
  entry.className = `log-entry log-${level}`;

  const timestamp = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
addLog("Aguardando ação do utilizador...", "info");

// --- Transmitter Mode ---
elements.btnTransmitter.addEventListener("click", async () => {
  transmitterActive = !transmitterActive;

  if (transmitterActive) {
    elements.btnTransmitter.classList.add("active");
    const info = await window.switchplay.getTransmitterInfo();

    if (info.available) {
      elements.transmitterIpValue.textContent = info.localIP;
      elements.transmitterSteps.innerHTML = "";

      for (const step of info.instructions) {
        const p = document.createElement("p");
        p.className = "transmitter-step";
        if (step.includes("Gateway")) {
          p.classList.add("highlight");
        }
        p.textContent = step;
        elements.transmitterSteps.appendChild(p);
      }

      elements.transmitterPanel.classList.remove("hidden");
    } else {
      addLog(info.message, "error");
      transmitterActive = false;
      elements.btnTransmitter.classList.remove("active");
    }
  } else {
    elements.btnTransmitter.classList.remove("active");
    elements.transmitterPanel.classList.add("hidden");
  }
});

// Platform specific styling
if (window.switchplay && window.switchplay.platform === "darwin") {
  // Hide custom window controls since macOS has native ones
  const controls = document.getElementById("titlebar-controls");
  if (controls) {
    controls.style.display = "none"; // Hide our custom buttons
  }

  // Move title to the right to avoid overlapping with native traffic lights on the left
  const titleDrag = document.getElementById("titlebar-drag");
  if (titleDrag) {
    titleDrag.style.justifyContent = "flex-end";
    titleDrag.style.paddingRight = "16px";
  }
}

// View Navigation - Settings Panel
function initViewNavigation() {
  const mainView = document.getElementById("main-view");
  const settingsView = document.getElementById("settings-view");
  const btnOpenSettings = document.getElementById("btn-open-settings");
  const btnCloseSettings = document.getElementById("btn-close-settings");

  console.log("🔧 Settings button found:", !!btnOpenSettings);
  console.log("🔧 Settings view found:", !!settingsView);
  console.log("🔧 Main view found:", !!mainView);
  console.log("🔧 Close button found:", !!btnCloseSettings);

  if (btnOpenSettings) {
    btnOpenSettings.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("⚙️ Opening settings...");

      if (mainView) mainView.classList.add("hidden");
      if (settingsView) {
        settingsView.classList.remove("hidden");
        settingsView.style.display = "flex";
      }
    });
  }

  if (btnCloseSettings) {
    btnCloseSettings.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("🔙 Closing settings...");

      if (mainView) mainView.classList.remove("hidden");
      if (settingsView) {
        settingsView.classList.add("hidden");
        settingsView.style.display = "none";
      }

      // Save state when leaving settings
      saveSettings();
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initViewNavigation);
} else {
  // DOM is already ready
  initViewNavigation();
}
