import { isDirectExecution, requiredEnvironmentVariable, sleep } from "./lib/runtime.mjs";

const REQUEST_TIMEOUT_MS = 30_000;
const READINESS_ATTEMPTS = 24;
const READINESS_INTERVAL_MS = 5_000;
const SESSION_COOKIE_NAME = "eccommerce.sid";

function normalizeOrigin(name) {
  const rawValue = requiredEnvironmentVariable(name);
  const url = new URL(rawValue);

  if (url.protocol !== "https:" || url.pathname !== "/") {
    throw new Error(`${name} must be an HTTPS origin without a path.`);
  }

  return url.origin;
}

async function requestJson(url, options = {}, expectedStatus = 200, { fetchImplementation = fetch } = {}) {
  const response = await fetchImplementation(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status !== expectedStatus) {
    throw new Error(`${url} returned HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${url} did not return JSON.`);
  }

  return {
    body: await response.json(),
    headers: response.headers,
  };
}

function assertServiceStatus(body, expectedStatus, url) {
  if (body?.status !== expectedStatus || body?.service !== "eccommerce-api") {
    throw new Error(`${url} returned an unexpected service status.`);
  }
}

function getSessionCookie(headers) {
  if (typeof headers.getSetCookie !== "function") {
    throw new Error("The current Node.js runtime does not support Headers.getSetCookie().");
  }

  const sessionHeaders = headers
    .getSetCookie()
    .filter((header) => header.trimStart().startsWith(`${SESSION_COOKIE_NAME}=`));

  if (sessionHeaders.length === 0) {
    throw new Error("Login did not set the expected session cookie.");
  }

  if (sessionHeaders.length > 1) {
    throw new Error("Login set multiple session cookies unexpectedly.");
  }

  const [sessionHeader] = sessionHeaders;

  if (!/(?:^|;\s*)Secure(?:;|$)/i.test(sessionHeader)) {
    throw new Error("The staging session cookie is missing Secure.");
  }

  if (!/(?:^|;\s*)HttpOnly(?:;|$)/i.test(sessionHeader)) {
    throw new Error("The staging session cookie is missing HttpOnly.");
  }

  if (!/(?:^|;\s*)SameSite=Lax(?:;|$)/i.test(sessionHeader)) {
    throw new Error("The staging session cookie is not SameSite=Lax.");
  }

  if (/(?:^|;\s*)Domain=/i.test(sessionHeader)) {
    throw new Error("The staging session cookie must remain host-only.");
  }

  return sessionHeader.split(";", 1)[0];
}

async function waitUntilReady(
  apiOrigin,
  {
    requestJsonImplementation = requestJson,
    sleepImplementation = sleep,
    readinessAttempts = READINESS_ATTEMPTS,
    readinessIntervalMs = READINESS_INTERVAL_MS,
  } = {},
) {
  const readinessUrl = `${apiOrigin}/ready`;
  let lastError;

  for (let attempt = 1; attempt <= readinessAttempts; attempt += 1) {
    try {
      const { body } = await requestJsonImplementation(readinessUrl);
      assertServiceStatus(body, "ready", readinessUrl);
      return;
    } catch (error) {
      lastError = error;
      console.log(`Readiness attempt ${attempt}/${readinessAttempts} has not passed yet.`);
    }

    await sleepImplementation(readinessIntervalMs);
  }

  throw lastError ?? new Error("The staging API did not become ready.");
}

async function runPublicChecks(apiOrigin, webOrigin, { requestJsonImplementation = requestJson } = {}) {
  const endpoints = [
    { url: `${apiOrigin}/health`, expectedStatus: "ok" },
    { url: `${apiOrigin}/ready`, expectedStatus: "ready" },
    { url: `${webOrigin}/api/health`, expectedStatus: "ok" },
    { url: `${webOrigin}/api/ready`, expectedStatus: "ready" },
  ];

  for (const endpoint of endpoints) {
    const { body } = await requestJsonImplementation(endpoint.url);
    assertServiceStatus(body, endpoint.expectedStatus, endpoint.url);
  }

  const pricingUrl = `${webOrigin}/api/storefront/pricing`;
  const { body: pricingBody } = await requestJsonImplementation(pricingUrl);

  if (
    typeof pricingBody?.pricing?.baseCurrency !== "string" ||
    !Array.isArray(pricingBody?.pricing?.currencies) ||
    pricingBody.pricing.currencies.length === 0
  ) {
    throw new Error(`${pricingUrl} returned an invalid pricing contract.`);
  }

  const productsUrl = `${webOrigin}/api/storefront/products`;
  const { body: productsBody } = await requestJsonImplementation(productsUrl);

  if (!Array.isArray(productsBody?.products)) {
    throw new Error(`${productsUrl} returned an invalid product contract.`);
  }
}

async function runSessionChecks(
  { webOrigin, email, password },
  { requestJsonImplementation = requestJson, fetchImplementation = fetch } = {},
) {
  const commonHeaders = {
    "Content-Type": "application/json",
    Origin: webOrigin,
  };
  const loginUrl = `${webOrigin}/api/auth/login`;
  const loginResult = await requestJsonImplementation(loginUrl, {
    method: "POST",
    headers: commonHeaders,
    body: JSON.stringify({ email, password }),
  });

  if (loginResult.body?.user?.email?.toLowerCase() !== email.toLowerCase()) {
    throw new Error("Login returned an unexpected user.");
  }

  const sessionCookie = getSessionCookie(loginResult.headers);
  const authenticatedHeaders = {
    Cookie: sessionCookie,
    Origin: webOrigin,
  };
  const meUrl = `${webOrigin}/api/auth/me`;
  const { body: meBody } = await requestJsonImplementation(meUrl, {
    headers: authenticatedHeaders,
  });

  if (meBody?.user?.email?.toLowerCase() !== email.toLowerCase()) {
    throw new Error("The authenticated session returned an unexpected user.");
  }

  const csrfUrl = `${webOrigin}/api/auth/csrf-token`;
  const { body: csrfBody } = await requestJsonImplementation(csrfUrl, {
    headers: authenticatedHeaders,
  });

  if (typeof csrfBody?.csrfToken !== "string" || !csrfBody.csrfToken) {
    throw new Error("The authenticated session did not receive a CSRF token.");
  }

  const logoutUrl = `${webOrigin}/api/auth/logout`;
  const logoutResponse = await fetchImplementation(logoutUrl, {
    method: "POST",
    headers: {
      ...authenticatedHeaders,
      "x-csrf-token": csrfBody.csrfToken,
    },
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (logoutResponse.status !== 204) {
    throw new Error(`${logoutUrl} returned HTTP ${logoutResponse.status}.`);
  }

  const { body: loggedOutBody } = await requestJsonImplementation(meUrl, {
    headers: authenticatedHeaders,
  });

  if (loggedOutBody?.user !== null) {
    throw new Error("The old session remained authenticated after logout.");
  }
}

async function main() {
  const apiOrigin = normalizeOrigin("STAGING_API_ORIGIN");
  const webOrigin = normalizeOrigin("STAGING_WEB_ORIGIN");
  const email = requiredEnvironmentVariable("STAGING_SMOKE_EMAIL");
  const password = requiredEnvironmentVariable("STAGING_SMOKE_PASSWORD");

  await waitUntilReady(apiOrigin);
  await runPublicChecks(apiOrigin, webOrigin);
  await runSessionChecks({ webOrigin, email, password });

  console.log("Staging public, rewrite, session, CSRF, and logout checks passed.");
}

export {
  assertServiceStatus,
  getSessionCookie,
  normalizeOrigin,
  requestJson,
  runPublicChecks,
  runSessionChecks,
  waitUntilReady,
};

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Smoke checks failed.");
    process.exitCode = 1;
  });
}
