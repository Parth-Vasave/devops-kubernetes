FROM node:26-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY index.js generator.js ./

EXPOSE 3000

CMD ["node", "index.js"]
