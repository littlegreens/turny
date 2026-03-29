/**
 * Imposta la password di un utente in locale (senza email).
 *
 * Uso consigliato (evita errori con $, !, spazi in PowerShell):
 *   npm run set-password -- tua@email.com
 *   → chiede la password due volte (nessun problema di quoting)
 *
 * Uso con password sulla riga di comando:
 *   PowerShell: node scripts/set-local-password.mjs email 'LaTuaPassword$con$simboli'
 *   cmd.exe:    idem con apici doppi se serve
 *
 * Richiede DATABASE_URL nel file .env nella root di turni-app.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env");

function loadEnv() {
  if (!existsSync(envPath)) {
    console.error("Manca il file .env in", root);
    process.exit(1);
  }
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function readPasswordInteractive() {
  const rl = readline.createInterface({ input, output });
  try {
    const p1 = await rl.question("Nuova password (min 8 caratteri): ");
    const p2 = await rl.question("Ripeti password: ");
    if (p1 !== p2) {
      console.error("Le password non coincidono.");
      process.exit(1);
    }
    return p1;
  } finally {
    rl.close();
  }
}

async function main() {
  loadEnv();

  const email = process.argv[2]?.toLowerCase().trim();
  let newPassword = process.argv[3];

  if (!email) {
    console.error("Uso: npm run set-password -- <email>");
    console.error("     (poi inserisci la password quando richiesta — consigliato su Windows)");
    console.error("Oppure: node scripts/set-local-password.mjs <email> '<password tra apici>'");
    process.exit(1);
  }

  if (!newPassword) {
    console.log("Modalità interattiva: nessun carattere speciale verrà alterato dalla shell.");
    newPassword = await readPasswordInteractive();
  } else if (process.platform === "win32") {
    console.warn(
      "Suggerimento: in PowerShell i caratteri $ e ` alterano la password passata come argomento.\n" +
        "Se il login fallisce, rilancia senza password dopo -- (solo email) e incolla la password qui.",
    );
  }

  if (!newPassword || newPassword.length < 8) {
    console.error("Password assente o troppo corta (min 8 caratteri).");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (!existing) {
      console.error("Nessun utente con email:", email);
      process.exit(1);
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: hash },
    });
    await prisma.session.deleteMany({ where: { userId: existing.id } });
    console.log("Password aggiornata per:", existing.email, "(sessioni invalidate).");
    console.log("Ora accedi con quella password e la stessa email (o lo username se usi name).");
  } catch (e) {
    console.error("Errore:", e.message ?? e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
