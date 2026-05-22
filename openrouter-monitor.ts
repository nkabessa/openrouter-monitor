/**
 * OpenRouter Rate Limit Monitor
 *
 * Monitoriza os limites de uso da API OpenRouter para modelos :free
 *
 * Uso:
 *   OPENROUTER_API_KEY=sk-or-... npx ts-node openrouter-monitor.ts
 *   OPENROUTER_API_KEY=sk-or-... npx ts-node openrouter-monitor.ts --watch 60
 *
 * Flags:
 *   --watch <segundos>   Corre em loop, refrescando a cada N segundos
 *   --test               Faz um pedido de teste ao modelo e mostra os headers de rate limit
 */

import "dotenv/config";
const API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const FREE_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface KeyInfo {
  data: {
    label: string;
    usage: number;        // créditos gastos (USD)
    limit: number | null; // limite de créditos (null = sem limite definido)
    is_free_tier: boolean;
    rate_limit: {
      requests: number;
      interval: string;   // ex: "10s"
    };
  };
}

interface RateLimitHeaders {
  limit: string | null;
  remaining: string | null;
  reset: string | null; // timestamp em ms
}

// ─── API: informação da chave ─────────────────────────────────────────────────

async function fetchKeyInfo(): Promise<KeyInfo> {
  const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Erro ao obter info da chave (${res.status}): ${body}`);
  }

  return res.json() as Promise<KeyInfo>;
}

// ─── API: pedido de teste com leitura de headers ──────────────────────────────

async function testRequestWithHeaders(): Promise<{
  success: boolean;
  rateLimitHeaders: RateLimitHeaders;
  error?: string;
}> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: FREE_MODEL,
      max_tokens: 5,
      messages: [{ role: "user", content: "Hi" }],
    }),
  });

  const rateLimitHeaders: RateLimitHeaders = {
    limit:     res.headers.get("X-RateLimit-Limit"),
    remaining: res.headers.get("X-RateLimit-Remaining"),
    reset:     res.headers.get("X-RateLimit-Reset"),
  };

  if (!res.ok) {
    const body = (await res.json()) as { error?: { message?: string } };
    return {
      success: false,
      rateLimitHeaders,
      error: body?.error?.message ?? `HTTP ${res.status}`,
    };
  }

  return { success: true, rateLimitHeaders };
}

// ─── Utilitários de formatação ────────────────────────────────────────────────

function formatReset(resetMs: string | null): string {
  if (!resetMs) return "desconhecido";
  const ts = Number(resetMs);
  if (isNaN(ts)) return resetMs;

  const resetDate = new Date(ts);
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();

  if (diffMs <= 0) return "já renovou";

  const diffMins = Math.floor(diffMs / 60_000);
  const diffSecs = Math.floor((diffMs % 60_000) / 1000);
  const timeStr =
    diffMins > 0 ? `${diffMins}m ${diffSecs}s` : `${diffSecs}s`;

  return `${resetDate.toLocaleTimeString("pt-PT")} (em ${timeStr})`;
}

function bar(used: number, total: number, width = 20): string {
  const pct = Math.min(used / total, 1);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const color =
    pct > 0.8 ? "\x1b[31m" : pct > 0.5 ? "\x1b[33m" : "\x1b[32m";
  return `${color}${"█".repeat(filled)}${"░".repeat(empty)}\x1b[0m`;
}

function separator(char = "─", len = 50): string {
  return char.repeat(len);
}

// ─── Render principal ─────────────────────────────────────────────────────────

async function printStatus(showTest: boolean): Promise<void> {
  console.clear();
  const now = new Date().toLocaleString("pt-PT");
  console.log(`\n\x1b[1m⚡ OpenRouter Rate Limit Monitor\x1b[0m  ${now}`);
  console.log(separator());

  // Secção 1: info da chave
  let keyInfo: KeyInfo;
  try {
    keyInfo = await fetchKeyInfo();
  } catch (err) {
    console.error("\x1b[31m✖ Não foi possível obter info da chave:\x1b[0m", err);
    return;
  }

  const { label, usage, limit, is_free_tier, rate_limit } = keyInfo.data;

  console.log(`\x1b[1m🔑 Chave:\x1b[0m  ${label || "(sem label)"}`);
  console.log(
    `\x1b[1m💰 Uso:\x1b[0m    $${usage.toFixed(6)} USD` +
      (limit ? ` / $${limit.toFixed(2)} USD` : " (sem limite de créditos)")
  );
  console.log(
    `\x1b[1m🎯 Tier:\x1b[0m   ${is_free_tier ? "🆓 Free tier" : "💳 Paid tier"}`
  );
  console.log(
    `\x1b[1m⏱  Limite:\x1b[0m ${rate_limit.requests} req / ${rate_limit.interval}`
  );

  // Limites conhecidos do tier gratuito
  if (is_free_tier) {
    console.log(separator("·"));
    console.log("\x1b[2m Limites do free tier (OpenRouter):\x1b[0m");
    console.log("\x1b[2m   • 20 pedidos / minuto\x1b[0m");
    console.log("\x1b[2m   • 50–200 pedidos / dia (depende de ter créditos)\x1b[0m");
    console.log(
      "\x1b[2m   • Renova às 00:00 UTC (01:00 Lisboa hora de verão)\x1b[0m"
    );
  }

  // Secção 2: pedido de teste com headers ao vivo
  if (showTest) {
    console.log(separator());
    console.log("\x1b[1m🧪 Pedido de teste ao modelo...\x1b[0m");

    const { success, rateLimitHeaders, error } = await testRequestWithHeaders();

    if (!success) {
      console.log(`\x1b[31m✖ Pedido falhou: ${error}\x1b[0m`);
    } else {
      console.log("\x1b[32m✔ Pedido bem-sucedido\x1b[0m");
    }

    const { limit: lim, remaining, reset } = rateLimitHeaders;

    if (lim && remaining) {
      const limN = Number(lim);
      const remN = Number(remaining);
      const usedN = limN - remN;
      const pct = ((usedN / limN) * 100).toFixed(1);

      console.log(`\n\x1b[1mHeaders de rate limit recebidos:\x1b[0m`);
      console.log(
        `  Limite:     ${lim} pedidos`
      );
      console.log(
        `  Restantes:  \x1b[1m${remaining}\x1b[0m pedidos  (${pct}% usado)`
      );
      console.log(`  Progresso:  ${bar(usedN, limN)}`);
      console.log(`  Renova em:  ${formatReset(reset)}`);
    } else {
      console.log(
        "\x1b[33m⚠ Headers de rate limit não devolvidos (normal em modo :free sem erros 429)\x1b[0m"
      );
    }
  }

  console.log(separator());
  console.log(
    "\x1b[2mDica: em caso de 429, os headers X-RateLimit-* vêm na resposta de erro\x1b[0m\n"
  );
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error(
      "\x1b[31m✖ Define a variável de ambiente OPENROUTER_API_KEY\x1b[0m\n" +
        "  Exemplo: OPENROUTER_API_KEY=sk-or-... npx ts-node openrouter-monitor.ts"
    );
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const watchIdx = args.indexOf("--watch");
  const doTest = args.includes("--test");

  if (watchIdx !== -1) {
    const interval = Number(args[watchIdx + 1]) || 60;
    console.log(`\x1b[1mModo watch: a refrescar de ${interval} em ${interval}s\x1b[0m`);

    const run = async (): Promise<void> => {
      await printStatus(doTest);
      setTimeout(run, interval * 1000);
    };
    await run();
  } else {
    await printStatus(doTest);
  }
}

main().catch((err) => {
  console.error("\x1b[31mErro inesperado:\x1b[0m", err);
  process.exit(1);
});
