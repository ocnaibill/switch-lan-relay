const dgram = require('dgram');

const PORT = 11451;
const SERVER_IP = '100.64.0.2'; // O IP do seu Proxmox no Headscale

// Socket para falar com o Servidor (VPN)
const vpnSocket = dgram.createSocket('udp4');
// Socket para ouvir o Emulador (Local)
const localSocket = dgram.createSocket('udp4');

// 1. Ouvindo o Servidor (O que vem dos amigos)
vpnSocket.on('message', (msg, rinfo) => {
    console.log(`[VPN] Pacote recebido do servidor. Repassando para o emulador local...`);
    // O Client recebe da VPN e grita na rede local (broadcast) para o emulador pegar
    localSocket.send(msg, 0, msg.length, PORT, '255.255.255.255', (err) => {
        if (err) console.error(`Erro ao enviar para LAN: ${err}`);
    });
});

// 2. Ouvindo o Emulador (O que você faz)
localSocket.on('message', (msg, rinfo) => {
    // Evita loop infinito (não retransmite os próprios pacotes que acabamos de injetar)
    if (rinfo.address === '127.0.0.1' /* ou o IP local do próprio Client */) {
        console.log(`[LAN] Emulador gritou! Mandando para o Servidor...`);
        vpnSocket.send(msg, 0, msg.length, PORT, SERVER_IP, (err) => {
             if (err) console.error(`Erro ao enviar para VPN: ${err}`);
        });
    }
});

// Iniciando os Sockets
localSocket.bind(PORT, () => {
    localSocket.setBroadcast(true);
    console.log(`📡 Ouvindo emulador na rede local na porta ${PORT}`);
});

// O socket da VPN não precisa de bind fixo, o SO escolhe uma porta aleatória para o tiro direto
console.log(`🚀 Client conectado! Repassando tráfego para ${SERVER_IP}`);
