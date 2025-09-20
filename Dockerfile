FROM node:24-slim

WORKDIR /app

COPY package*.json ./

RUN npm install

RUN npm install -g nodemon

COPY . .

CMD ["npm", "start"]