# 🎮 SwitchPlay

> **Zero-config LAN Play for Nintendo Switch over a private VPN.**

[🇧🇷 Leia em Português](./README.pt-BR.md)

SwitchPlay is a desktop application that lets you play Nintendo Switch games online with friends through a private, encrypted VPN — no port forwarding, no public servers, no configuration required.

It combines [Headscale](https://github.com/juanfont/headscale) (self-hosted Tailscale control server), [tsnet](https://pkg.go.dev/tailscale.com/tsnet) (userspace VPN), and [switch-lan-play](https://github.com/spacemeowx2/switch-lan-play) into a single click-to-connect experience.

---

## ✨ Features

- **Dynamic Config** — Easily input your Headscale URL and Auth Key from the client's Settings menu.
- **Zero Admin Required** — Uses `tsnet` (userspace networking), no TUN device, no driver installation.
- **Private & Encrypted** — All traffic goes through your own Headscale server with WireGuard encryption.
- **Cross-Platform** — Windows, macOS, and Linux.
- **Transmitter Mode** — Bridge a physical Nintendo Switch over your local network.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SwitchPlay Client                     │
│                                                         │
│  ┌──────────────┐    ┌─────────────┐    ┌────────────┐ │
│  │   Electron   │───▶│  ts-sidecar │───▶│  Headscale │ │
│  │  (UI + IPC)  │    │  (Go/tsnet) │    │  (Server)  │ │
│  └──────┬───────┘    └─────────────┘    └────────────┘ │
│         │                                               │
│         ▼                                               │
│  ┌──────────────┐                       ┌────────────┐ │
│  │   lan-play   │──────────────────────▶│  LAN Play  │ │
│  │   (client)   │         UDP           │  (Server)  │ │
│  └──────────────┘                       └────────────┘ │
└─────────────────────────────────────────────────────────┘
```

1. **Electron** — Desktop UI with connection controls and real-time logs.
2. **ts-sidecar** — Go binary using `tsnet` to create an invisible VPN tunnel (no TUN device).
3. **lan-play** — Captures Switch network traffic and relays it to the server.

---

## 📋 Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Node.js](https://nodejs.org/) | ≥ 18 | Electron runtime |
| [Go](https://go.dev/) | ≥ 1.21 | Compile the VPN sidecar |
| [Docker](https://www.docker.com/) | ≥ 20 | Run the server stack |

---

## 🖥️ Server Setup

The server runs two containers: **Headscale** (VPN control plane) and **switch-lan-play** (game relay).

### 1. Start the server stack

```bash
cd server/
docker compose up -d
```

### 2. Configure Headscale

```bash
# Create a user namespace
docker exec headscale-server headscale users create switchlan

# Generate a reusable pre-auth key (valid for 1 year)
docker exec headscale-server headscale preauthkeys create \
  --reusable \
  --expiration 365d \
  --user switchlan
```

Save the generated key — you'll need it in the SwitchPlay client UI.

### 3. Expose Headscale

Headscale must be accessible over HTTPS. Use a reverse proxy (Nginx, Traefik, Caddy) or a Cloudflare Tunnel to expose port `8080` on a domain like `switch.yourdomain.com`.

---

## 🔧 Client Setup

### 1. Clone and install

```bash
git clone https://github.com/ocnaibill/SwitchPlay.git
cd SwitchPlay/client
npm install
```

### 2. Download lan-play

Download the `lan-play` binary for your platform from [switch-lan-play releases](https://github.com/spacemeowx2/switch-lan-play/releases) and place it in `client/bin/`:

```
client/bin/
├── lan-play-darwin-arm64    # macOS Apple Silicon
├── lan-play-darwin-amd64    # macOS Intel
├── lan-play-win32-amd64.exe # Windows
└── lan-play-linux-amd64     # Linux
```

### 3. Compile the VPN sidecar

```bash
cd client
./build-app.sh
```

### 4. Run the Client

```bash
npm start
```

Once the UI opens, go to Settings ⚙️ and insert:
- **Headscale URL** (e.g., `https://switch.yourdomain.com`)
- **Tailscale Auth Key** (from the server configuration)
- **Lan Play Server** (`100.64.0.2:11451` by default)

Then click **Connect**!

---

## 📦 Building the Final App

To package SwitchPlay into a `.exe`, `.dmg` or `.AppImage` out of the source code:

```bash
cd client
npm run build:all
```

Compiled installers will appear in the `client/dist/` directory.

---

## 🤝 Project Structure

```
SwitchPlay/
├── LICENSE               # GPL-3.0
├── README.md             # This file
├── README.pt-BR.md       # Portuguese version
│
├── server/
│   └── docker-compose.yml  # Headscale + LAN Play server
│
└── client/
    ├── package.json        # Electron app config + electron-builder
    ├── main.js             # Electron main process
    ├── build-app.sh        # Build script for all architectures
    ├── src/
    │   ├── index.html      # UI HTML
    │   ├── renderer.js     # UI logic
    │   └── processes.js    # Child process manager (vpn + lan-play)
    └── sidecar/
        └── main.go         # tsnet Go VPN sidecar
```

---

## 🔥 Acknowledgments

This project wouldn't be possible without these amazing open-source projects:

- **[switch-lan-play](https://github.com/spacemeowx2/switch-lan-play)** by [@spacemeowx2](https://github.com/spacemeowx2) — The core LAN Play protocol for Nintendo Switch.
- **[Headscale](https://github.com/juanfont/headscale)** by [@juanfont](https://github.com/juanfont) — Self-hosted, open-source Tailscale control server.
- **[Tailscale](https://github.com/tailscale/tailscale)** — The `tsnet` library that powers our invisible VPN.
- **[Electron](https://www.electronjs.org/)** — Cross-platform desktop app framework.

---

## 📄 License

This project is licensed under the [GNU General Public License v3.0](./LICENSE).

This license was chosen for compatibility with [switch-lan-play](https://github.com/spacemeowx2/switch-lan-play) (GPL-3.0), whose binary is distributed alongside SwitchPlay.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/ocnaibill">@ocnaibill</a>
</p>
