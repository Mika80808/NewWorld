/// <reference types="vite/client" />

declare module 'wa-sqlite/dist/wa-sqlite-async.mjs' {
  const SQLiteESMFactory: () => Promise<unknown>;
  export default SQLiteESMFactory;
}

declare module 'wa-sqlite' {
  export const Factory: (module: unknown) => {
    capi: {
      sqlite3_vfs_register: (vfs: unknown, makeDefault: boolean) => void;
      SQLITE_OPEN_CREATE: number;
      SQLITE_OPEN_READWRITE: number;
      sqlite3: new () => {
        open_v2: (filename: string, flags: number) => Promise<void>;
      };
    };
  };

  export const createOPFSVFS: () => Promise<unknown>;
}
