FROM denoland/deno:alpine-1.46.3

# Définir le répertoire de base
WORKDIR /app

# Copier le code du frontend
COPY frontend/ ./frontend/

# Copier les certificats depuis le backend 
COPY backend/certs/ ./backend/certs/

# Se placer dans le dossier frontend pour l'exécution
WORKDIR /app/frontend

# Exposer le port du frontend
EXPOSE 8080

# Lancer le serveur frontend
CMD ["run", "--allow-net", "--allow-read", "server.ts"]