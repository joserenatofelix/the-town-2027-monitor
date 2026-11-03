import type { Config } from "@netlify/functions";
import { verificarPagina } from "../lib/monitor.js";

export default async (request: Request) => {
  const pathname = new URL(request.url).pathname;
  const headers = { "Cache-Control": "no-store" };
  const method = pathname === "/api/status" ? "GET" : pathname === "/api/check" ? "POST" : null;
  if (!method) return Response.json({ erro: "Rota não encontrada." }, { status: 404, headers });
  if (request.method !== method) {
    return Response.json({ erro: "Método não permitido." }, {
      status: 405, headers: { ...headers, Allow: method },
    });
  }
  const status = await verificarPagina();
  return Response.json(status, { status: status.fase === "error" ? 502 : 200, headers });
};

export const config: Config = { path: ["/api/status", "/api/check"] };
