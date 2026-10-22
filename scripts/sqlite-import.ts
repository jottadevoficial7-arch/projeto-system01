// Offline migration only. This module is never imported by the application.
import { DatabaseSync, backup } from "node:sqlite";
import { closeSync, openSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { DATA_TABLES } from "../src/lib/database-schema";
import { checkDatabase, query, transaction } from "../src/lib/db";

export class ImportError extends Error {}
type Row = Record<string, unknown>;
type Snapshot = Record<(typeof DATA_TABLES)[number], Row[]>;
export type ImportOptions = {
  source: string;
  apply?: boolean;
  backupPath?: string;
  writesStopped?: boolean;
};

function fingerprint(rows: Row[]): string {
  const normalized = rows
    .map((row) =>
      JSON.stringify(
        Object.keys(row)
          .sort()
          .map((key) => [key, row[key] === null ? null : String(row[key])]),
      ),
    )
    .sort();
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
function readSnapshot(db: DatabaseSync): Snapshot {
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok")
    throw new ImportError(
      "SQLite corrompido; restaure uma cópia íntegra antes de migrar.",
    );
  if (db.prepare("PRAGMA foreign_key_check").all().length)
    throw new ImportError(
      "SQLite contém referências inválidas. A importação foi interrompida.",
    );
  return Object.fromEntries(
    DATA_TABLES.map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table}`).all(),
    ]),
  ) as Snapshot;
}

export async function importSqlite(options: ImportOptions) {
  const source = resolve(options.source);
  if (!statSync(source).isFile())
    throw new ImportError("A origem deve ser um arquivo SQLite existente.");
  if (options.apply && (!options.writesStopped || !options.backupPath))
    throw new ImportError(
      "Aplicar exige --confirm-writes-stopped e --backup em um caminho novo.",
    );
  await checkDatabase();
  let sourceDb = new DatabaseSync(source, { readOnly: true });
  let backupPath: string | undefined;
  try {
    if (options.apply) {
      backupPath = resolve(options.backupPath!);
      if (backupPath === realpathSync(source))
        throw new ImportError(
          "O backup deve ter um caminho diferente da origem.",
        );
      // Exclusive creation prevents overwriting any existing backup; mode protects hashes/sessions.
      closeSync(openSync(backupPath, "wx", 0o600));
      await backup(sourceDb, backupPath); // SQLite online backup includes committed WAL entries.
      sourceDb.close();
      sourceDb = new DatabaseSync(backupPath, { readOnly: true });
    }
    sourceDb.exec("BEGIN");
    const snapshot = readSnapshot(sourceDb);
    const sourceColumns = Object.fromEntries(
      DATA_TABLES.map((table) => [
        table,
        sourceDb
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((row) => String(row.name))
          .sort(),
      ]),
    );
    const counts = Object.fromEntries(
      DATA_TABLES.map((table) => [table, snapshot[table].length]),
    );
    await transaction(async () => {
      if (options.apply) {
        // Block all writers until the complete import has been verified and committed.
        await query(
          `LOCK TABLE ${DATA_TABLES.join(", ")} IN ACCESS EXCLUSIVE MODE`,
        );
      } else await query("SET TRANSACTION READ ONLY");
      for (const table of DATA_TABLES) {
        const fields = (await query(`SELECT * FROM ${table} LIMIT 0`)).fields
          .map((field) => field.name)
          .sort();
        if (JSON.stringify(fields) !== JSON.stringify(sourceColumns[table]))
          throw new ImportError(
            `Schema incompatível na tabela ${table}; nenhum registro foi importado.`,
          );
        if ((await query(`SELECT 1 FROM ${table} LIMIT 1`)).rows.length)
          throw new ImportError(
            `Destino não está vazio (${table}). Use um banco novo; não sobrescreva dados existentes.`,
          );
      }
      if (!options.apply) return;
      for (const table of DATA_TABLES) {
        for (const row of snapshot[table]) {
          const columns = Object.keys(row);
          // Column names were checked against the fixed destination schema above.
          await query(
            `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")})`,
            columns.map((name) => row[name]),
          );
        }
        const target = (await query(`SELECT * FROM ${table}`)).rows;
        if (
          target.length !== snapshot[table].length ||
          fingerprint(target) !== fingerprint(snapshot[table])
        )
          throw new ImportError(
            `Verificação falhou em ${table}. A transação será revertida.`,
          );
      }
    });
    return {
      mode: options.apply ? "applied" : "dry-run",
      counts,
      verified: true,
      ...(backupPath ? { backupCreated: true } : {}),
    };
  } finally {
    sourceDb.close();
  }
}
