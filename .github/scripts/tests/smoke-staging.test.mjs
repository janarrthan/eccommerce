import assert from "node:assert/strict";
import test from "node:test";

import {
  assertServiceStatus,
  getSessionCookie,
  normalizeOrigin,
  requestJson,
  runPublicChecks,
  runSessionChecks,
  waitUntilReady,
} from "../smoke-staging.mjs";

const apiOrigin = "https://eccommerce-api-staging.onrender.com";
const webOrigin = "https://eccommerce-web-staging.onrender.com";
const email = "smoke@example.test";
const password = "test-password";
const sessionValue = "test-session-value";
const sessionCookie = `eccommerce.sid=${sessionValue}`;
const csrfToken = "test-csrf-token";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function headersWithCookies(...cookies) {
  return { getSetCookie: () => [...cookies] };
}

function secureSessionHeader(value = sessionValue) {
  return `eccommerce.sid=${value}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function withEnvironmentVariable(name, value, operation) {
  const hadOriginalValue = Object.hasOwn(process.env, name);
  const originalValue = process.env[name];

  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }

  try {
    return operation();
  } finally {
    if (hadOriginalValue) {
      process.env[name] = originalValue;
    } else {
      delete process.env[name];
    }
  }
}

test("normalizeOrigin returns a normalized HTTPS origin", () => {
  const result = withEnvironmentVariable("TEST_STAGING_ORIGIN", `${webOrigin}/`, () =>
    normalizeOrigin("TEST_STAGING_ORIGIN"),
  );

  assert.equal(result, webOrigin);
});

for (const invalidOrigin of [
  "http://eccommerce-web-staging.onrender.com",
  "https://eccommerce-web-staging.onrender.com/api",
]) {
  test(`normalizeOrigin rejects ${invalidOrigin}`, () => {
    assert.throws(
      () => withEnvironmentVariable("TEST_STAGING_ORIGIN", invalidOrigin, () => normalizeOrigin("TEST_STAGING_ORIGIN")),
      /must be an HTTPS origin without a path/,
    );
  });
}

test("normalizeOrigin rejects a missing environment variable", () => {
  assert.throws(
    () => withEnvironmentVariable("TEST_STAGING_ORIGIN", undefined, () => normalizeOrigin("TEST_STAGING_ORIGIN")),
    /TEST_STAGING_ORIGIN is missing/,
  );
});

test("requestJson prevents redirects and returns JSON with response headers", async () => {
  let capturedUrl;
  let capturedOptions;

  const result = await requestJson(`${webOrigin}/api/health`, { headers: { Accept: "application/json" } }, 200, {
    fetchImplementation: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return jsonResponse({ status: "ok" });
    },
  });

  assert.equal(capturedUrl, `${webOrigin}/api/health`);
  assert.equal(capturedOptions.redirect, "error");
  assert.deepEqual(capturedOptions.headers, { Accept: "application/json" });
  assert.ok(capturedOptions.signal instanceof AbortSignal);
  assert.deepEqual(result.body, { status: "ok" });
  assert.match(result.headers.get("content-type"), /application\/json/i);
});

test("requestJson rejects unexpected status without exposing the response body", async () => {
  const sensitiveBody = "internal-sensitive-response";

  await assert.rejects(
    requestJson(`${webOrigin}/api/health`, {}, 200, {
      fetchImplementation: async () => jsonResponse({ message: sensitiveBody }, 503),
    }),
    (error) => {
      assert.match(error.message, /returned HTTP 503/);
      assert.doesNotMatch(error.message, new RegExp(sensitiveBody));
      return true;
    },
  );
});

test("requestJson rejects non-JSON and invalid JSON responses", async () => {
  await assert.rejects(
    requestJson(`${webOrigin}/api/health`, {}, 200, {
      fetchImplementation: async () => new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } }),
    }),
    /did not return JSON/,
  );
  await assert.rejects(
    requestJson(`${webOrigin}/api/health`, {}, 200, {
      fetchImplementation: async () =>
        new Response("{", { status: 200, headers: { "Content-Type": "application/json" } }),
    }),
    SyntaxError,
  );
});

test("assertServiceStatus accepts only the expected API contract", () => {
  assert.doesNotThrow(() =>
    assertServiceStatus({ status: "ready", service: "eccommerce-api" }, "ready", `${apiOrigin}/ready`),
  );

  for (const body of [
    { status: "ok", service: "eccommerce-api" },
    { status: "ready", service: "different-service" },
    null,
  ]) {
    assert.throws(() => assertServiceStatus(body, "ready", `${apiOrigin}/ready`), /unexpected service status/);
  }
});

test("getSessionCookie returns exactly one secure host-only session cookie pair", () => {
  const headers = headersWithCookies("preferences=dark; Path=/; Secure; SameSite=Lax", secureSessionHeader());

  assert.equal(getSessionCookie(headers), sessionCookie);
});

test("getSessionCookie accepts case-insensitive security attributes", () => {
  const headers = headersWithCookies(`eccommerce.sid=${sessionValue}; Path=/; httponly; secure; samesite=lax`);

  assert.equal(getSessionCookie(headers), sessionCookie);
});

test("getSessionCookie requires getSetCookie and one session cookie", () => {
  assert.throws(() => getSessionCookie({ get: () => secureSessionHeader() }), /does not support Headers.getSetCookie/);
  assert.throws(
    () => getSessionCookie(headersWithCookies("preferences=dark; Path=/; Secure")),
    /did not set the expected session cookie/,
  );
  assert.throws(
    () => getSessionCookie(headersWithCookies(secureSessionHeader("first"), secureSessionHeader("second"))),
    /multiple session cookies unexpectedly/,
  );
});

for (const testCase of [
  {
    name: "Secure",
    cookie: `eccommerce.sid=${sessionValue}; Path=/; HttpOnly; SameSite=Lax`,
    message: /missing Secure/,
  },
  {
    name: "HttpOnly",
    cookie: `eccommerce.sid=${sessionValue}; Path=/; Secure; SameSite=Lax`,
    message: /missing HttpOnly/,
  },
  {
    name: "SameSite=Lax",
    cookie: `eccommerce.sid=${sessionValue}; Path=/; HttpOnly; Secure; SameSite=None`,
    message: /not SameSite=Lax/,
  },
]) {
  test(`getSessionCookie rejects a cookie without ${testCase.name}`, () => {
    assert.throws(() => getSessionCookie(headersWithCookies(testCase.cookie)), testCase.message);
  });
}

test("getSessionCookie rejects a Domain attribute", () => {
  assert.throws(
    () =>
      getSessionCookie(
        headersWithCookies(
          `eccommerce.sid=${sessionValue}; Domain=example.com; Path=/; HttpOnly; Secure; SameSite=Lax`,
        ),
      ),
    /must remain host-only/,
  );
});

test("waitUntilReady retries bounded failures and then accepts readiness", async (context) => {
  context.mock.method(console, "log", () => {});

  const observedSleeps = [];
  let requestCount = 0;

  await waitUntilReady(apiOrigin, {
    requestJsonImplementation: async () => {
      requestCount += 1;

      if (requestCount === 1) {
        throw new Error("temporarily unavailable");
      }

      if (requestCount === 2) {
        return { body: { status: "starting", service: "eccommerce-api" } };
      }

      return { body: { status: "ready", service: "eccommerce-api" } };
    },
    sleepImplementation: async (milliseconds) => observedSleeps.push(milliseconds),
    readinessAttempts: 3,
    readinessIntervalMs: 25,
  });

  assert.equal(requestCount, 3);
  assert.deepEqual(observedSleeps, [25, 25]);
});

test("waitUntilReady fails after the bounded attempt limit", async (context) => {
  context.mock.method(console, "log", () => {});
  let requestCount = 0;

  await assert.rejects(
    waitUntilReady(apiOrigin, {
      requestJsonImplementation: async () => {
        requestCount += 1;
        throw new Error("still unavailable");
      },
      sleepImplementation: async () => {},
      readinessAttempts: 2,
      readinessIntervalMs: 0,
    }),
    /still unavailable/,
  );
  assert.equal(requestCount, 2);
});

function successfulPublicResponse(url) {
  return new Map([
    [`${apiOrigin}/health`, { status: "ok", service: "eccommerce-api" }],
    [`${apiOrigin}/ready`, { status: "ready", service: "eccommerce-api" }],
    [`${webOrigin}/api/health`, { status: "ok", service: "eccommerce-api" }],
    [`${webOrigin}/api/ready`, { status: "ready", service: "eccommerce-api" }],
    [`${webOrigin}/api/storefront/pricing`, { pricing: { baseCurrency: "USD", currencies: ["USD"] } }],
    [`${webOrigin}/api/storefront/products`, { products: [] }],
  ]).get(url);
}

test("runPublicChecks validates direct API and frontend rewrite contracts", async () => {
  const requestedUrls = [];

  await runPublicChecks(apiOrigin, webOrigin, {
    requestJsonImplementation: async (url) => {
      requestedUrls.push(url);
      return { body: successfulPublicResponse(url) };
    },
  });

  assert.deepEqual(requestedUrls, [
    `${apiOrigin}/health`,
    `${apiOrigin}/ready`,
    `${webOrigin}/api/health`,
    `${webOrigin}/api/ready`,
    `${webOrigin}/api/storefront/pricing`,
    `${webOrigin}/api/storefront/products`,
  ]);
});

test("runPublicChecks rejects invalid pricing and product contracts", async () => {
  await assert.rejects(
    runPublicChecks(apiOrigin, webOrigin, {
      requestJsonImplementation: async (url) => ({
        body:
          url === `${webOrigin}/api/storefront/pricing`
            ? { pricing: { baseCurrency: "USD", currencies: [] } }
            : successfulPublicResponse(url),
      }),
    }),
    /invalid pricing contract/,
  );

  await assert.rejects(
    runPublicChecks(apiOrigin, webOrigin, {
      requestJsonImplementation: async (url) => ({
        body: url === `${webOrigin}/api/storefront/products` ? { products: null } : successfulPublicResponse(url),
      }),
    }),
    /invalid product contract/,
  );
});

function successfulSessionFakes({ keepSessionAfterLogout = false, logoutStatus = 204 } = {}) {
  const jsonRequests = [];
  const logoutRequests = [];
  let meRequestCount = 0;

  return {
    jsonRequests,
    logoutRequests,
    getMeRequestCount: () => meRequestCount,
    requestJsonImplementation: async (url, options = {}) => {
      jsonRequests.push({ url, options });

      if (url === `${webOrigin}/api/auth/login`) {
        return {
          body: { user: { email } },
          headers: headersWithCookies(secureSessionHeader()),
        };
      }

      if (url === `${webOrigin}/api/auth/me`) {
        meRequestCount += 1;
        return {
          body: meRequestCount === 1 || keepSessionAfterLogout ? { user: { email } } : { user: null },
        };
      }

      if (url === `${webOrigin}/api/auth/csrf-token`) {
        return { body: { csrfToken } };
      }

      throw new Error(`Unexpected test URL ${url}.`);
    },
    fetchImplementation: async (url, options) => {
      logoutRequests.push({ url, options });
      return new Response(logoutStatus === 204 ? null : "failed", { status: logoutStatus });
    },
  };
}

test("runSessionChecks verifies login, session, CSRF, logout, and invalidation", async () => {
  const fakes = successfulSessionFakes();

  await runSessionChecks(
    { webOrigin, email, password },
    {
      requestJsonImplementation: fakes.requestJsonImplementation,
      fetchImplementation: fakes.fetchImplementation,
    },
  );

  const loginRequest = fakes.jsonRequests[0];
  assert.equal(loginRequest.url, `${webOrigin}/api/auth/login`);
  assert.equal(loginRequest.options.method, "POST");
  assert.equal(loginRequest.options.headers.Origin, webOrigin);
  assert.equal(loginRequest.options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(loginRequest.options.body), { email, password });

  for (const request of fakes.jsonRequests.slice(1)) {
    assert.equal(request.options.headers.Cookie, sessionCookie);
    assert.equal(request.options.headers.Origin, webOrigin);
  }

  assert.equal(fakes.logoutRequests.length, 1);
  const logoutRequest = fakes.logoutRequests[0];
  assert.equal(logoutRequest.url, `${webOrigin}/api/auth/logout`);
  assert.equal(logoutRequest.options.method, "POST");
  assert.equal(logoutRequest.options.redirect, "error");
  assert.equal(logoutRequest.options.headers.Cookie, sessionCookie);
  assert.equal(logoutRequest.options.headers.Origin, webOrigin);
  assert.equal(logoutRequest.options.headers["x-csrf-token"], csrfToken);
  assert.ok(logoutRequest.options.signal instanceof AbortSignal);
  assert.equal(fakes.getMeRequestCount(), 2);
});

test("runSessionChecks rejects an unexpected login identity", async () => {
  await assert.rejects(
    runSessionChecks(
      { webOrigin, email, password },
      {
        requestJsonImplementation: async () => ({
          body: { user: { email: "different@example.test" } },
          headers: headersWithCookies(secureSessionHeader()),
        }),
        fetchImplementation: async () => {
          throw new Error("Logout must not run after a rejected login.");
        },
      },
    ),
    /Login returned an unexpected user/,
  );
});

test("runSessionChecks requires a non-empty CSRF token", async () => {
  let requestCount = 0;

  await assert.rejects(
    runSessionChecks(
      { webOrigin, email, password },
      {
        requestJsonImplementation: async () => {
          requestCount += 1;

          if (requestCount === 1) {
            return {
              body: { user: { email } },
              headers: headersWithCookies(secureSessionHeader()),
            };
          }

          if (requestCount === 2) {
            return { body: { user: { email } } };
          }

          return { body: { csrfToken: "" } };
        },
        fetchImplementation: async () => {
          throw new Error("Logout must not run without a CSRF token.");
        },
      },
    ),
    /did not receive a CSRF token/,
  );
});

test("runSessionChecks rejects an unsuccessful logout without exposing session material", async () => {
  const fakes = successfulSessionFakes({ logoutStatus: 500 });

  await assert.rejects(
    runSessionChecks(
      { webOrigin, email, password },
      {
        requestJsonImplementation: fakes.requestJsonImplementation,
        fetchImplementation: fakes.fetchImplementation,
      },
    ),
    (error) => {
      assert.match(error.message, /auth\/logout returned HTTP 500/);

      for (const sensitiveValue of [password, sessionValue, csrfToken]) {
        assert.doesNotMatch(error.message, new RegExp(sensitiveValue));
      }

      return true;
    },
  );
});

test("runSessionChecks rejects a session that remains authenticated after logout", async () => {
  const fakes = successfulSessionFakes({ keepSessionAfterLogout: true });

  await assert.rejects(
    runSessionChecks(
      { webOrigin, email, password },
      {
        requestJsonImplementation: fakes.requestJsonImplementation,
        fetchImplementation: fakes.fetchImplementation,
      },
    ),
    /old session remained authenticated after logout/,
  );
});
