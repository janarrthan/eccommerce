import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  extractDigest,
  parseJsonResponse,
  retrieveDeploy,
  triggerDeploy,
  verifyDeployedImage,
  waitForLiveDeploy,
} from "../deploy-render-image.mjs";
import { isDirectExecution, requiredEnvironmentVariable } from "../lib/runtime.mjs";

const expectedDigest = `sha256:${"a".repeat(64)}`;
const otherDigest = `sha256:${"b".repeat(64)}`;
const expectedImage = `ghcr.io/janarrthan/eccommerce-server@${expectedDigest}`;
const serviceId = "srv-test123";
const deployId = "dep-test123";
const apiKey = "test-render-key";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("shared runtime helpers validate environment values and direct execution", () => {
  assert.equal(requiredEnvironmentVariable("EXAMPLE", { EXAMPLE: "  configured  " }), "configured");
  assert.throws(() => requiredEnvironmentVariable("MISSING", {}), /MISSING is missing/);

  const entryPath = resolve("direct-entry.mjs");
  const moduleUrl = pathToFileURL(entryPath).href;

  assert.equal(isDirectExecution(moduleUrl, ["node", entryPath]), true);
  assert.equal(isDirectExecution(moduleUrl, ["node", resolve("different-entry.mjs")]), false);
  assert.equal(isDirectExecution(moduleUrl, ["node"]), false);
});

test("parseJsonResponse parses JSON and rejects empty or invalid responses", async () => {
  assert.deepEqual(await parseJsonResponse(jsonResponse({ id: deployId }), "test operation"), { id: deployId });

  await assert.rejects(
    parseJsonResponse(new Response(""), "test operation"),
    /test operation returned an empty response/,
  );

  await assert.rejects(parseJsonResponse(new Response("{"), "test operation"), /test operation returned invalid JSON/);
});

test("triggerDeploy sends the exact digest and returns the deployment", async () => {
  let capturedUrl;
  let capturedOptions;

  const deploy = await triggerDeploy(
    { apiKey, serviceId, imageReference: expectedImage },
    {
      fetchImplementation: async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return jsonResponse({ id: deployId, status: "created" }, 201);
      },
    },
  );

  assert.deepEqual(deploy, { id: deployId, status: "created" });
  assert.equal(capturedUrl, `https://api.render.com/v1/services/${serviceId}/deploys`);
  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.headers.Authorization, `Bearer ${apiKey}`);
  assert.equal(capturedOptions.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(capturedOptions.body), { imageUrl: expectedImage });
  assert.ok(capturedOptions.signal instanceof AbortSignal);
});

test("triggerDeploy fails closed on HTTP 202 without retrying", async () => {
  let requestCount = 0;

  await assert.rejects(
    triggerDeploy(
      { apiKey, serviceId, imageReference: expectedImage },
      {
        fetchImplementation: async () => {
          requestCount += 1;
          return jsonResponse({}, 202);
        },
      },
    ),
    /without creating an identifiable deploy/,
  );

  assert.equal(requestCount, 1);
});

test("triggerDeploy rejects an unexpected status without exposing its response body", async () => {
  const sensitiveBody = "provider-internal-sensitive-detail";

  await assert.rejects(
    triggerDeploy(
      { apiKey, serviceId, imageReference: expectedImage },
      {
        fetchImplementation: async () => jsonResponse({ message: sensitiveBody }, 403),
      },
    ),
    (error) => {
      assert.match(error.message, /HTTP 403/);
      assert.doesNotMatch(error.message, new RegExp(sensitiveBody));
      return true;
    },
  );
});

for (const invalidId of [undefined, null, 123, ""]) {
  test(`triggerDeploy rejects deployment ID ${String(invalidId)}`, async () => {
    await assert.rejects(
      triggerDeploy(
        { apiKey, serviceId, imageReference: expectedImage },
        {
          fetchImplementation: async () => jsonResponse({ id: invalidId }, 201),
        },
      ),
      /did not return a deployment ID/,
    );
  });
}

test("retrieveDeploy requests the identified deployment", async () => {
  let capturedUrl;
  let capturedOptions;

  const deploy = await retrieveDeploy(
    { apiKey, serviceId, deployId },
    {
      fetchImplementation: async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return jsonResponse({ id: deployId, status: "live" });
      },
    },
  );

  assert.deepEqual(deploy, { id: deployId, status: "live" });
  assert.equal(capturedUrl, `https://api.render.com/v1/services/${serviceId}/deploys/${deployId}`);
  assert.equal(capturedOptions.headers.Authorization, `Bearer ${apiKey}`);
  assert.ok(capturedOptions.signal instanceof AbortSignal);
});

for (const status of [429, 500, 502, 503, 504]) {
  test(`retrieveDeploy treats HTTP ${status} as transient`, async () => {
    const deploy = await retrieveDeploy(
      { apiKey, serviceId, deployId },
      { fetchImplementation: async () => new Response(null, { status }) },
    );

    assert.equal(deploy, null);
  });
}

test("retrieveDeploy rejects a non-transient unsuccessful status", async () => {
  await assert.rejects(
    retrieveDeploy(
      { apiKey, serviceId, deployId },
      { fetchImplementation: async () => new Response(null, { status: 401 }) },
    ),
    /lookup failed with HTTP 401/,
  );
});

test("waitForLiveDeploy polls pending statuses until live", async (context) => {
  context.mock.method(console, "log", () => {});

  const statuses = ["created", "queued", "build_in_progress", "pre_deploy_in_progress", "update_in_progress", "live"];
  let lookupCount = 0;
  let sleepCount = 0;

  const liveDeploy = await waitForLiveDeploy(
    { apiKey, serviceId, deployId },
    {
      retrieveDeployImplementation: async () => ({ id: deployId, status: statuses[lookupCount++] }),
      sleepImplementation: async () => {
        sleepCount += 1;
      },
      maxPollAttempts: statuses.length,
      pollIntervalMs: 0,
    },
  );

  assert.equal(liveDeploy.status, "live");
  assert.equal(lookupCount, statuses.length);
  assert.equal(sleepCount, statuses.length - 1);
});

test("waitForLiveDeploy retries transient unavailability and timeouts", async (context) => {
  context.mock.method(console, "log", () => {});

  const timeoutError = new Error("request timed out");
  timeoutError.name = "TimeoutError";
  const results = [null, timeoutError, { id: deployId, status: "live" }];
  let lookupCount = 0;
  let sleepCount = 0;

  const liveDeploy = await waitForLiveDeploy(
    { apiKey, serviceId, deployId },
    {
      retrieveDeployImplementation: async () => {
        const result = results[lookupCount++];

        if (result instanceof Error) {
          throw result;
        }

        return result;
      },
      sleepImplementation: async () => {
        sleepCount += 1;
      },
      maxPollAttempts: results.length,
      pollIntervalMs: 0,
    },
  );

  assert.equal(liveDeploy.status, "live");
  assert.equal(lookupCount, 3);
  assert.equal(sleepCount, 2);
});

for (const status of ["build_failed", "pre_deploy_failed", "update_failed", "canceled", "deactivated"]) {
  test(`waitForLiveDeploy rejects terminal status ${status}`, async (context) => {
    context.mock.method(console, "log", () => {});

    await assert.rejects(
      waitForLiveDeploy(
        { apiKey, serviceId, deployId },
        {
          retrieveDeployImplementation: async () => ({ id: deployId, status }),
          sleepImplementation: async () => {},
          maxPollAttempts: 1,
          pollIntervalMs: 0,
        },
      ),
      new RegExp(`ended with status ${status}`),
    );
  });
}

test("waitForLiveDeploy rejects unknown statuses and bounded polling exhaustion", async (context) => {
  context.mock.method(console, "log", () => {});

  await assert.rejects(
    waitForLiveDeploy(
      { apiKey, serviceId, deployId },
      {
        retrieveDeployImplementation: async () => ({ id: deployId, status: "unexpected_status" }),
        sleepImplementation: async () => {},
        maxPollAttempts: 1,
        pollIntervalMs: 0,
      },
    ),
    /unknown deploy status unexpected_status/,
  );

  let lookupCount = 0;
  await assert.rejects(
    waitForLiveDeploy(
      { apiKey, serviceId, deployId },
      {
        retrieveDeployImplementation: async () => {
          lookupCount += 1;
          return { id: deployId, status: "queued" };
        },
        sleepImplementation: async () => {},
        maxPollAttempts: 2,
        pollIntervalMs: 0,
      },
    ),
    /polling deadline; last status: queued/,
  );
  assert.equal(lookupCount, 2);
});

test("extractDigest and verifyDeployedImage accept equivalent digest representations", () => {
  assert.equal(extractDigest(expectedImage), expectedDigest);

  for (const image of [
    { ref: expectedImage, sha: expectedDigest },
    { ref: "", sha: expectedDigest },
    { ref: "", sha: expectedDigest.replace("sha256:", "") },
  ]) {
    assert.doesNotThrow(() => verifyDeployedImage({ image }, expectedImage));
  }
});

test("verifyDeployedImage rejects a different or missing digest", () => {
  for (const image of [{ ref: `ghcr.io/janarrthan/eccommerce-server@${otherDigest}`, sha: otherDigest }, undefined]) {
    assert.throws(() => verifyDeployedImage({ image }, expectedImage), /does not match the requested digest/);
  }
});
