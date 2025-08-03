# Dockerfile (place in /frontend)
FROM node:18

WORKDIR /app

# Copy only package files first to install deps separately
COPY package*.json ./
RUN npm install

# Copy rest of the app
COPY . .

EXPOSE 5174