FROM denoland/deno:ubuntu-1.46.3


WORKDIR /app

COPY backend/ ./backend/

# Créer le dossier data qui sera utilisé comme point de montage pour SQLite
RUN mkdir ./data

# Se placer dans le dossier backend pour l'exécution
WORKDIR /app/backend

# Exposer le port du backend
EXPOSE 3000

# Lancer le serveur avec les bonnes permissions
CMD ["run", "--allow-net", "--allow-read","--allow-write", "--allow-env", "--allow-ffi", "--unstable-ffi", "back_server.ts"]