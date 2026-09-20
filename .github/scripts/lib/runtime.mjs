import { pathToFileURL } from "node:url";

export function requiredEnvironmentVariable(name, environment = process.env) {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`Required environment variable ${name} is missing.`);
  }

  return value;
}

export function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function isDirectExecution(moduleUrl, argv = process.argv) {
  const entryPath = argv[1];

  return Boolean(entryPath && moduleUrl === pathToFileURL(entryPath).href);
}
