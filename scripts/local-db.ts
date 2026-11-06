/**
 * Banco local para desenvolvimento, sem conta em lugar nenhum: PGlite (Postgres
 * em WASM) persistido em `.wrangler/pglite/data`.
 *
 * Usado pelo `vite.config.ts` quando não há `DATABASE_URL` no `.dev.vars`:
 *
 *   PGlite ← TCP (protocolo Postgres) ← proxy WebSocket ← Worker (driver Neon)
 *                     ↑
 *     drizzle-kit (`pnpm db:migrate`, `pnpm db:studio`), psql…
 *
 * O driver `@neondatabase/serverless` fala Postgres sobre WebSocket, então o
 * Worker conecta no proxy; ferramentas de linha de comando usam a porta TCP.
 * As portas são escolhidas pelo SO e gravadas em `.wrangler/pglite/server.json`
 * (lido pelo `drizzle.config.ts`).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { type AddressInfo, connect } from "node:net";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createWebSocketStream, WebSocketServer } from "ws";

// Caminhos relativos à raiz do repo (de onde rodam `pnpm dev` e o drizzle-kit,
// que carrega este arquivo como CommonJS, sem `import.meta`).
const root = process.cwd();

export const LOCAL_DB_DIR = join(root, ".wrangler/pglite");
export const LOCAL_DB_DATA_DIR = join(LOCAL_DB_DIR, "data");
const STATE_FILE = join(LOCAL_DB_DIR, "server.json");
const MIGRATIONS_FOLDER = join(root, "drizzle");
const HOST = "127.0.0.1";

interface LocalDbState {
  pid: number;
  /** URL Postgres (TCP) para drizzle-kit, psql etc. */
  url: string;
}

export interface LocalDb {
  /** URL que o Worker recebe como DATABASE_URL (aponta para o proxy WebSocket). */
  workerUrl: string;
  /** URL Postgres (TCP) para ferramentas como psql e drizzle-kit. */
  url: string;
  close: () => Promise<void>;
}

/**
 * Lê `DATABASE_URL` do ambiente ou do `.dev.vars` (o mesmo arquivo que o
 * Worker usa em dev). Sem ela, o dev usa o PGlite local.
 */
export function readDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const devVars = join(root, ".dev.vars");
  if (!existsSync(devVars)) return undefined;
  return parseEnv(readFileSync(devVars, "utf8")).DATABASE_URL || undefined;
}

/** URL TCP do PGlite se um `pnpm dev` estiver rodando (para o drizzle-kit). */
export function runningLocalDbUrl(): string | undefined {
  if (!existsSync(STATE_FILE)) return undefined;
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as LocalDbState;
    process.kill(state.pid, 0); // lança se o processo não existe mais
    return state.url;
  } catch {
    return undefined;
  }
}

export async function startLocalDb({
  dataDir = LOCAL_DB_DATA_DIR,
}: {
  /** Diretório do PGlite. `memory://` para um banco descartável (e2e). */
  dataDir?: string;
} = {}): Promise<LocalDb> {
  const persistent = !dataDir.startsWith("memory://");
  if (persistent) {
    // Dois processos no mesmo diretório corrompem o banco.
    const running = runningLocalDbUrl();
    if (running) {
      throw new Error(
        `O PGlite local já está aberto por outro \`pnpm dev\` (${running}). Pare-o antes de subir outro.`,
      );
    }
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(LOCAL_DB_DIR, { recursive: true });
  }

  const pglite = await PGlite.create(dataDir);
  // Aplica migrations pendentes ao subir: `pnpm dev` funciona do zero.
  await migrate(drizzle({ client: pglite }), { migrationsFolder: MIGRATIONS_FOLDER });

  const socketServer = new PGLiteSocketServer({
    db: pglite,
    host: HOST,
    // Porta TCP aleatória; fixe com LOCAL_DB_PORT (ex.: para o Hyperdrive local).
    port: Number(process.env.LOCAL_DB_PORT ?? 0),
    // O Worker abre uma conexão por request; o servidor enfileira as queries.
    maxConnections: 100,
  });
  await socketServer.start();
  const tcpPort = Number(socketServer.getServerConn().split(":").at(-1));

  // Proxy WebSocket → TCP, no formato que o driver do Neon espera (bytes do
  // protocolo Postgres em mensagens binárias).
  const wss = new WebSocketServer({ host: HOST, port: 0 });
  wss.on("connection", (ws) => {
    const tcp = connect(tcpPort, HOST);
    const stream = createWebSocketStream(ws);
    stream.pipe(tcp).pipe(stream);
    const destroy = () => {
      tcp.destroy();
      stream.destroy();
    };
    tcp.on("error", destroy);
    stream.on("error", destroy);
  });
  await new Promise<void>((done) => wss.once("listening", done));
  const wsPort = (wss.address() as AddressInfo).port;

  const url = `postgresql://postgres:postgres@${HOST}:${tcpPort}/postgres`;
  const workerUrl = `postgresql://postgres:postgres@${HOST}:${wsPort}/postgres`;
  if (persistent) {
    writeFileSync(STATE_FILE, JSON.stringify({ pid: process.pid, url } satisfies LocalDbState));
  }

  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= (async () => {
      if (persistent) rmSync(STATE_FILE, { force: true });
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((done) => wss.close(() => done()));
      await socketServer.stop();
      await pglite.close();
    })();
    return closing;
  };

  return { url, workerUrl, close };
}
