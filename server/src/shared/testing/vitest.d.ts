import "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabase: {
      databaseUrl: string;
      schemaPrefix: string;
    };
  }
}
