import { Application, send } from "https://deno.land/x/oak@v17.1.4/mod.ts";

declare const Deno: any;

const app = new Application();
const PORT = 8080;

const cert = await Deno.readTextFile("../backend/certs/cert.crt");
const key = await Deno.readTextFile("../backend/certs/key.key");

app.use(async (ctx) => {
  const filePath = ctx.request.url.pathname;
  const frontRoot = `${Deno.cwd()}/public`;

  try {
    await send(ctx, filePath, {
      root: frontRoot,
      index: "index.html",
    });
  } catch {
    await send(ctx, "/index.html", { root: frontRoot });
  }
});

console.log(`Front server (HTTPs) on https://localhost:${PORT}`);
await Deno.serve(
  {
    port: PORT,
    cert,
    key,
  },
  (req: Request, info: unknown) => app.fetch(req, info),
);
