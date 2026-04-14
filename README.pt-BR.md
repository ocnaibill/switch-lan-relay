# 🎮 SwitchPlay

> **LAN Play para Nintendo Switch sem configuração, através de uma VPN privada.**

[🇺🇸 Read in English](./README.md)

O SwitchPlay é uma aplicação desktop que permite jogar jogos de Nintendo Switch online com amigos através de uma VPN privada e criptografada — sem necessidade de abrir portas no roteador, sem servidores públicos, sem configurações complexas.

Ele combina o [Headscale](https://github.com/juanfont/headscale) (servidor de controle Tailscale open-source), [tsnet](https://pkg.go.dev/tailscale.com/tsnet) (VPN em nível de usuário) e [switch-lan-play](https://github.com/spacemeowx2/switch-lan-play) em uma experiência simples de apenas um clique.

---

## ✨ Funcionalidades

- **Configuração Dinâmica** — Insira facilmente a URL do seu Headscale e a Chave de Autenticação pelo menu de Configurações no próprio cliente.
- **Não Exige Permissões de Admin** — Usa `tsnet` (rede em nível de usuário), ou seja, sem placa TUN virtual e sem instalação de drivers de VPN no SO.
- **Privado e Criptografado** — Todo o tráfego passa pelo seu próprio servidor Headscale usando a criptografia do WireGuard.
- **Multiplataforma** — Funciona no Windows, macOS e Linux.
- **Modo Transmissor** — Repassa (bridge) o tráfego do seu Nintendo Switch físico pela sua rede local.

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    Cliente SwitchPlay                    │
│                                                         │
│  ┌──────────────┐    ┌─────────────┐    ┌────────────┐ │
│  │   Electron   │───▶│  ts-sidecar │───▶│  Headscale │ │
│  │  (UI + IPC)  │    │  (Go/tsnet) │    │ (Servidor) │ │
│  └──────┬───────┘    └─────────────┘    └────────────┘ │
│         │                                               │
│         ▼                                               │
│  ┌──────────────┐                       ┌────────────┐ │
│  │   lan-play   │──────────────────────▶│  LAN Play  │ │
│  │  (cliente)   │         UDP           │ (Servidor) │ │
│  └──────────────┘                       └────────────┘ │
└─────────────────────────────────────────────────────────┘
```

1. **Electron** — Interface desktop com controles de conexão e logs em tempo real.
2. **ts-sidecar** — Binário em Go que usa `tsnet` para criar um túnel VPN invisível.
3. **lan-play** — Captura o tráfego de rede do Switch e o redireciona para o servidor.

---

## 📋 Pré-requisitos

| Ferramenta | Versão | Propósito |
|------------|--------|-----------|
| [Node.js](https://nodejs.org/) | ≥ 18 | Ambiente de execução para o Electron |
| [Go](https://go.dev/) | ≥ 1.21 | Para compilar o sidecar da VPN |
| [Docker](https://www.docker.com/) | ≥ 20 | Para rodar os contineres do servidor |

---

## 🖥️ Configuração do Servidor

O servidor roda dois containers: **Headscale** (controle da VPN) e **switch-lan-play** (relé do jogo).

### 1. Iniciar a infraestrutura do servidor

```bash
cd server/
docker compose up -d
```

### 2. Configurar o Headscale

```bash
# Criar um namespace para o usuário
docker exec headscale-server headscale users create switchlan

# Gerar uma chave de autenticação prévia reutilizável (válida por 1 ano)
docker exec headscale-server headscale preauthkeys create \
  --reusable \
  --expiration 365d \
  --user switchlan
```

Salve a chave gerada — você precisará inseri-la na interface do cliente SwitchPlay.

### 3. Expor o Headscale

O Headscale deve estar acessível por HTTPS. Use um proxy reverso (Nginx, Traefik, Caddy) ou um Cloudflare Tunnel para expor a porta `8080` em um domínio, por exemplo: `switch.seudominio.com`.

---

## 🔧 Configuração do Cliente

### 1. Clonar e Instalar

```bash
git clone https://github.com/ocnaibill/SwitchPlay.git
cd SwitchPlay/client
npm install
```

### 2. Baixar o lan-play

Baixe o binário `lan-play` compatível com o seu sistema operacional na [página de lançamentos do switch-lan-play](https://github.com/spacemeowx2/switch-lan-play/releases) e coloque-o na pasta `client/bin/`:

```
client/bin/
├── lan-play-darwin-arm64    # macOS Apple Silicon
├── lan-play-darwin-amd64    # macOS Intel
├── lan-play-win32-amd64.exe # Windows
└── lan-play-linux-amd64     # Linux
```

### 3. Compilar o sidecar da VPN

```bash
cd client
./build-app.sh
```

### 4. Rodar o Cliente

```bash
npm start
```

Quando a interface abrir, vá até as Configurações ⚙️ e preencha:
- **Headscale URL** (ex: `https://switch.seudominio.com`)
- **Tailscale Auth Key** (a chave gerada no servidor)
- **Servidor LAN Play** (`100.64.0.2:11451` por padrão)

Então, basta clicar em **Conectar**!

---

## 📦 Compilando o Aplicativo Final

Para empacotar o SwitchPlay em arquivos instaláveis como `.exe`, `.dmg` ou `.AppImage` a partir do código fonte:

```bash
cd client
npm run build:all
```

Os instaladores compilados estarão na pasta `client/dist/`.

---

## 🔥 Agradecimentos e Referências

Este projeto não seria possível sem o esforço dessas iniciativas open-source:

- **[switch-lan-play](https://github.com/spacemeowx2/switch-lan-play)** por [@spacemeowx2](https://github.com/spacemeowx2) — O protocolo nativo de LAN Play para o Nintendo Switch.
- **[Headscale](https://github.com/juanfont/headscale)** por [@juanfont](https://github.com/juanfont) — Servidor de controle Tailscale auto-hospedado.
- **[Tailscale](https://github.com/tailscale/tailscale)** — A biblioteca `tsnet` que movimenta nossa VPN invisível.
- **[Electron](https://www.electronjs.org/)** — Framework para aplicativos desktop multiplataforma.

---

## 📄 Licença

Este projeto está licenciado sob a Licença [GNU General Public License v3.0](./LICENSE).

Esta licença foi escolhida para manter a compatibilidade total com o [switch-lan-play](https://github.com/spacemeowx2/switch-lan-play) (que é GPL-3.0), cujo binário é distribuído e empregado junto ao SwitchPlay.

---

<p align="center">
  Feito com ❤️ por <a href="https://github.com/ocnaibill">@ocnaibill</a>
</p>
