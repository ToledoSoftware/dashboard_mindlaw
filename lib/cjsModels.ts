import path from "node:path";
import { pathToFileURL } from "node:url";

async function loadRel<T = unknown>(rel: string): Promise<T> {
  const filePath = path.join(process.cwd(), rel);
  const href = pathToFileURL(filePath).href;
  const mod = await import(/* webpackIgnore: true */ href);
  return ((mod as { default?: T }).default ?? mod) as T;
}

export type CjsModels = {
  Sale: any;
  Support: any;
  Client: any;
  User: any;
  ensureClientByName: (...args: any[]) => Promise<any>;
  listAllClientsSorted: (...args: any[]) => Promise<any>;
  getClientEntradaStats: (...args: any[]) => Promise<any>;
  computeChaveUnica: (...args: any[]) => string;
  importListaAtividadeIfNeeded: () => Promise<{ ran: boolean; count: number; reason: string }>;
  syncClientsFromSupport: () => Promise<void>;
  deriveCategoriaNps: (item: unknown) => string;
  buildNpsColumnMap: (item: unknown) => unknown;
};

let cache: CjsModels | null = null;

export async function getCjsModels(): Promise<CjsModels> {
  if (cache) return cache;
  const [Sale, Support, Client, User, clientSync, npsAudit] = await Promise.all([
    loadRel("models/Sale.js"),
    loadRel("models/Support.js"),
    loadRel("models/Client.js"),
    loadRel("models/User.js"),
    loadRel("services/clientSync.js"),
    loadRel("lib/npsAudit.js")
  ]);
  const cs = clientSync as Record<string, any>;
  const na = npsAudit as Record<string, any>;
  cache = {
    Sale,
    Support,
    Client,
    User,
    ensureClientByName: cs.ensureClientByName,
    listAllClientsSorted: cs.listAllClientsSorted,
    getClientEntradaStats: cs.getClientEntradaStats,
    computeChaveUnica: cs.computeChaveUnica,
    importListaAtividadeIfNeeded: cs.importListaAtividadeIfNeeded,
    syncClientsFromSupport: cs.syncClientsFromSupport,
    deriveCategoriaNps: na.deriveCategoriaNps,
    buildNpsColumnMap: na.buildNpsColumnMap
  };
  return cache;
}
