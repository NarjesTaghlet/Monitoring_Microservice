FROM node:22-alpine


WORKDIR /app

COPY package*.json ./

RUN npm install --legacy-peer-deps 


# Ajoute les dépendances nécessaires à la compilation native
RUN apk add --no-cache python3 make g++ \
    && npm cache clean --force

COPY . .

RUN npm run build

EXPOSE 3035  3006


CMD ["node", "dist/main.js"]
