FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
# O relay precisa rodar na rede do host para acessar as interfaces da VPN
CMD ["npm", "start"]
