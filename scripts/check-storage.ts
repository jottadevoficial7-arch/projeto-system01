import { checkDatabase, closeDb, storageError } from "../src/lib/db";
async function main() {
  try {
    console.log(JSON.stringify(await checkDatabase()));
  } catch (error) {
    console.error("Falha no PostgreSQL:", storageError(error, "check").code);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main();
