# openrouter-monitor

Script TypeScript para monitorizar os limites de uso da API OpenRouter, com foco em modelos gratuitos (`:free`).

---

## Pré-requisitos

- [Node.js LTS](https://nodejs.org) instalado
- Conta no [OpenRouter](https://openrouter.ai) com uma API key
- VS Code com terminal integrado (`Ctrl + '`)

---

## Instalação

```bash
# 1. Cria e entra na pasta do projeto
mkdir openrouter-monitor
cd openrouter-monitor

# 2. Inicia o projeto Node
npm init -y

# 3. Instala o ts-node e typescript globalmente
npm install -g ts-node typescript

# 4. Instala as dependências locais
npm install dotenv
npm install --save-dev @types/node

# 5. Cria o tsconfig.json
echo '{"compilerOptions":{"module":"commonjs","target":"es2020","esModuleInterop":true,"types":["node"]}}' > tsconfig.json
```

---

## Configuração

Cria um ficheiro `.env` na raiz do projeto:

```
OPENROUTER_API_KEY=sk-or-...
```

Adiciona esta linha no topo do `openrouter-monitor.ts`:

```ts
import "dotenv/config";
```

A estrutura final da pasta deve ficar assim:

```
openrouter-monitor/
├── openrouter-monitor.ts
├── .env
├── tsconfig.json
└── package.json
```

> Nunca faças commit do ficheiro `.env`. Adiciona-o ao `.gitignore` se usares Git.

---

## Modos de execução

### Ver estado atual da chave

Mostra créditos, tier (free/paid) e limite configurado na chave.

```bash
npx ts-node openrouter-monitor.ts
```

Exemplo de output:

```
⚡ OpenRouter Rate Limit Monitor  22/05/2026, 16:37:37
──────────────────────────────────────────────────
🔑 Chave:  sk-or-v1-4de...a85
💰 Uso:    $0.000000 USD (sem limite de créditos)
🎯 Tier:   💳 Paid tier
⏱  Limite: -1 req / 10s
```

---

### Incluir pedido de teste ao modelo

Faz um pedido real ao modelo e tenta ler os headers `X-RateLimit-*` da resposta.

```bash
npx ts-node openrouter-monitor.ts --test
```

> Os headers só são devolvidos pelo OpenRouter em respostas de erro 429. Em pedidos bem-sucedidos, o aviso `⚠ Headers de rate limit não devolvidos` é normal.

---

### Modo watch (atualização automática)

Atualiza o output de N em N segundos. Útil para monitorizar em tempo real.

```bash
# Atualiza de 60 em 60 segundos
npx ts-node openrouter-monitor.ts --watch 60

# Watch com pedido de teste incluído
npx ts-node openrouter-monitor.ts --watch 60 --test
```

---

## Limites do OpenRouter

| Tier | Pedidos/dia | Pedidos/min |
|---|---|---|
| Free (sem créditos) | 50 | 20 |
| Free (com créditos) | 1000 | 20 |
| Paid | sem limite fixo | sem limite fixo |

Os limites diários renovam às **00:00 UTC** (01:00 hora de Lisboa em hora de verão).

Contas com `-1` no campo de limite têm tier paid sem restrições definidas pelo OpenRouter. Os limites passam a depender do provider do modelo.

---

## Erros comuns

**`Cannot find name 'process'`**

Faltam os tipos do Node. Corre:

```bash
npm install --save-dev @types/node
```

E confirma que o `tsconfig.json` tem `"types": ["node"]`.

---

**`429 Too Many Requests`**

Duas causas possíveis:

1. Atingiste o teu limite diário, usa `--test` para confirmar
2. O modelo `:free` está globalmente saturado (acontece mesmo com créditos)

Nesse caso, muda para o modelo pago equivalente:
```
nvidia/nemotron-3-super-120b-a12b
```

---

**`OPENROUTER_API_KEY` não definida**

Confirma que o ficheiro `.env` existe na pasta correta e que adicionaste `import "dotenv/config"` no topo do script.

---

## Endpoints usados

| Endpoint | Método | Função |
|---|---|---|
| `/api/v1/auth/key` | GET | Info da chave: créditos, tier, limite |
| `/api/v1/chat/completions` | POST | Pedido de teste com leitura de headers |
