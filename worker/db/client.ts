import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Tipo do banco usado pelas rotas. É o supertipo comum dos drivers do Drizzle
 * para Postgres: em produção/dev é o Neon (WebSocket); nos testes, PGlite.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbConnection {
  db: Database;
  /** Fecha a conexão. Chamado no fim de cada request (via `waitUntil`). */
  close: () => Promise<void>;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Abre uma conexão por request com o driver `@neondatabase/serverless`
 * (Postgres sobre WebSocket). Em Workers não dá para reaproveitar conexões entre
 * requests, então o Pool é criado aqui e encerrado no fim do request. O Pool só
 * conecta de fato na primeira query.
 *
 * Para um Postgres local (o PGlite que o `pnpm dev` sobe, ou um Postgres seu com
 * um proxy WebSocket), o host é `localhost`/`127.0.0.1`: aí o driver fala `ws://`
 * direto com a porta da URL, sem TLS.
 */
export function connectNeon(databaseUrl: string): DbConnection {
  const url = new URL(databaseUrl);
  if (LOCAL_HOSTS.has(url.hostname)) {
    neonConfig.wsProxy = (host, port) => `${host}:${port}/`;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineTLS = false;
    neonConfig.pipelineConnect = false;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  return {
    db: drizzle({ client: pool, schema }),
    close: () => pool.end(),
  };
}
