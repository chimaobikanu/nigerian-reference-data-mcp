# Build/run image for directory listings (Glama starts the container and sends
# MCP introspection requests). Node 20 ESM, single entry point.
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY index.js ./
COPY README.md ./
COPY LICENSE ./

ENV NODE_ENV=production

CMD ["node", "index.js"]
