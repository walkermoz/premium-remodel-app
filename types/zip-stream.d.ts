declare module "zip-stream" {
  import { Duplex } from "node:stream";

  export default class ZipStream extends Duplex {
    constructor(options?: {
      forceLocalTime?: boolean;
      forceZip64?: boolean;
      store?: boolean;
      zlib?: { level?: number };
    });

    entry(
      source: string | Buffer,
      data: { name: string },
      callback: (error?: Error | null) => void,
    ): this | void;

    finalize(): void;
  }
}
