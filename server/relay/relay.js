const dgram = require("dgram");

// Porta padrão do Switch LAN Play / ldn_mitm
const PORT = 11451;
// Endereço de broadcast da rede Headscale (100.64.0.0/10)
const BROADCAST_ADDR = "100.127.255.255";

const server = dgram.createSocket("udp4");
const client = dgram.createSocket("udp4");

client.bind(() => {
  client.setBroadcast(true);
});

server.on("message", (msg, rinfo) => {
  console.log(
    `Pacote de descoberta recebido de ${rinfo.address}:${rinfo.port}`,
  );

  client.send(msg, 0, msg.length, PORT, BROADCAST_ADDR, (err) => {
    if (err) console.error(`Erro ao retransmitir: ${err}`);
    else console.log("Pacote retransmitido para a VPN!");
  });
});

server.on("listening", () => {
  const address = server.address();
  console.log(`Relay UDP rodando e escutando na porta ${address.port}`);
});

server.bind(PORT);
