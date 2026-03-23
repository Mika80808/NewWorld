import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs"
import * as SQLite from "wa-sqlite"

export async function initDB() {
  const module = await SQLiteESMFactory()
  const sqlite3 = SQLite.Factory(module)

  // 掛載 OPFS
  const capi = sqlite3.capi
  const vfs = await SQLite.createOPFSVFS()
  capi.sqlite3_vfs_register(vfs, true)

  // 開啟 DB（持久化）
  const db = new capi.sqlite3()
  await db.open_v2("file:game.db?vfs=opfs", capi.SQLITE_OPEN_CREATE | capi.SQLITE_OPEN_READWRITE)

  return db
}