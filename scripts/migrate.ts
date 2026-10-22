import { closeDb, migrateDatabase, storageError } from "../src/lib/db";

async function main() {
  if (process.env.DATABASE_DIRECT_URL)
    process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL;
  try {
    await migrateDatabase();
    console.log(
      "PostgreSQL: schema atualizado. Nenhum dado de usuário foi removido.",
    );
  } catch (error) {
    console.error(
      "Falha na migração do schema:",
      storageError(error, "migrate").code,
    );
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main();
