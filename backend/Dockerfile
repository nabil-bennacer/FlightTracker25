FROM denoland/deno:debian

WORKDIR /app


COPY backend/ ./backend/


COPY data/ ./data/


WORKDIR /app/backend

# 5. Exposer le port
EXPOSE 3000


CMD ["run", "--allow-net", "--allow-read","--allow-write", "--allow-env", "--allow-ffi", "--unstable-ffi", "back_server.ts"] 