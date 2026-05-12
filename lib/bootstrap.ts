import bcrypt from "bcryptjs";
import { getCjsModels } from "./cjsModels";

let ran = false;

export async function runOnceBootstrap(): Promise<void> {
  if (ran) return;
  ran = true;

  const { User, Client, importListaAtividadeIfNeeded, syncClientsFromSupport } = await getCjsModels();

  const username = process.env.DEFAULT_ADMIN_USERNAME || "admin";
  const email = process.env.DEFAULT_ADMIN_EMAIL || "admin@mindlaw.com";
  const password = process.env.DEFAULT_ADMIN_PASSWORD || "mindlaw123";

  try {
    const exists = await User.findOne({ username });
    if (!exists) {
      const hash = await bcrypt.hash(password, 10);
      await User.create({ username, email, password_hash: hash, role: "admin" });
    }
  } catch (e) {
    console.error("[MindLaw] seed user:", (e as Error).message);
  }

  try {
    await Client.syncIndexes();
  } catch (e) {
    console.error("[MindLaw] syncIndexes Client:", (e as Error).message);
  }

  try {
    await importListaAtividadeIfNeeded();
  } catch (e) {
    console.error("[MindLaw] import lista atividade:", (e as Error).message);
  }

  try {
    await syncClientsFromSupport();
  } catch (e) {
    console.error("[MindLaw] sincronização de clientes:", (e as Error).message);
  }
}
