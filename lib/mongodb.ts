import mongoose from "mongoose";

declare global {
  // eslint-disable-next-line no-var
  var _mongooseMindLaw: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
}

const g = globalThis as typeof globalThis & { _mongooseMindLaw?: typeof global._mongooseMindLaw };

if (!g._mongooseMindLaw) {
  g._mongooseMindLaw = { conn: null, promise: null };
}

export default async function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI não configurado.");

  if (g._mongooseMindLaw!.conn) return g._mongooseMindLaw!.conn;

  if (!g._mongooseMindLaw!.promise) {
    g._mongooseMindLaw!.promise = mongoose.connect(uri);
  }
  g._mongooseMindLaw!.conn = await g._mongooseMindLaw!.promise;

  const { runOnceBootstrap } = await import("./bootstrap");
  await runOnceBootstrap();

  return g._mongooseMindLaw!.conn;
}
