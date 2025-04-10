import { Application, send } from "https://deno.land/x/oak@v17.1.4/mod.ts";

const app = new Application();
const PORT = 8080;

app.use(async (ctx) => {
  const filePath = ctx.request.url.pathname;
  // Ici, on part du principe que tu exécutes le script depuis le dossier static_html_server
  const frontRoot = `${Deno.cwd()}/front_end`;

  try {
    await send(ctx, filePath, {
      root: frontRoot,
      index: "index.html",
    });
  } catch {
    await send(ctx, "/index.html", { root: frontRoot });
  }
});

console.log(`Front server (HTTP) on http://localhost:${PORT}`);
await app.listen({ port: PORT });
