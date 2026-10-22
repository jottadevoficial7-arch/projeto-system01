import { parseArgs } from "node:util";
import { closeDb, storageError } from "../src/lib/db";
import { importSqlite, ImportError } from "./sqlite-import";
async function main() {
  try {
    const { values } = parseArgs({
      options: {
        source: { type: "string" },
        backup: { type: "string" },
        apply: { type: "boolean", default: false },
        "confirm-writes-stopped": { type: "boolean", default: false },
      },
    });
    if (!values.source)
      throw new ImportError(
        "Use --source /caminho/system.sqlite. Padrão: simulação, sem gravar no destino.",
      );
    if (process.env.DATABASE_DIRECT_URL)
      process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL;
    console.log(
      JSON.stringify(
        await importSqlite({
          source: values.source,
          backupPath: values.backup,
          apply: values.apply,
          writesStopped: values["confirm-writes-stopped"],
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      "Importação interrompida:",
      error instanceof ImportError
        ? error.message
        : storageError(error, "import").code,
    );
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main();
