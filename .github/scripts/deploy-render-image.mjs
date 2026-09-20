import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDirectExecution, requiredEnvironmentVariable, sleep } from "./lib/runtime.mjs";

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 90;
const REQUEST_TIMEOUT_MS = 30_000;

const pendingStatuses = new Set([
  "created",
  "queued",
  "build_in_progress",
  "pre_deploy_in_progress",
  "update_in_progress",
]);

const failedStatuses = new Set(["build_failed", "pre_deploy_failed", "update_failed", "canceled", "deactivated"]);

async function parseJsonResponse(response, operation) {
  const responseText = await response.text();

  if (!responseText) {
    throw new Error(`${operation} returned an empty response.`);
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(`${operation} returned invalid JSON.`);
  }
}

async function triggerDeploy({ apiKey, serviceId, imageReference }, { fetchImplementation = fetch } = {}) {
  const response = await fetchImplementation(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageUrl: imageReference }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 202) {
    throw new Error(
      "Render queued the request without creating an identifiable deploy. " +
        "No deployment will be treated as verified; inspect the Render dashboard.",
    );
  }

  if (response.status !== 201) {
    throw new Error(`Render rejected the deployment request with HTTP ${response.status}.`);
  }

  const deploy = await parseJsonResponse(response, "Render deployment request");

  if (typeof deploy.id !== "string" || !deploy.id) {
    throw new Error("Render did not return a deployment ID.");
  }

  return deploy;
}

async function retrieveDeploy({ apiKey, serviceId, deployId }, { fetchImplementation = fetch } = {}) {
  const response = await fetchImplementation(`https://api.render.com/v1/services/${serviceId}/deploys/${deployId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 429 || response.status >= 500) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Render deployment lookup failed with HTTP ${response.status}.`);
  }

  return parseJsonResponse(response, "Render deployment lookup");
}

async function waitForLiveDeploy(
  options,
  {
    retrieveDeployImplementation = retrieveDeploy,
    sleepImplementation = sleep,
    maxPollAttempts = MAX_POLL_ATTEMPTS,
    pollIntervalMs = POLL_INTERVAL_MS,
  } = {},
) {
  let lastStatus = "unknown";

  for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
    let deploy;

    try {
      deploy = await retrieveDeployImplementation(options);
    } catch (error) {
      if (error?.name !== "TimeoutError") {
        throw error;
      }

      deploy = null;
    }

    if (!deploy) {
      console.log(`Render status lookup ${attempt}/${maxPollAttempts} was transiently unavailable.`);
      await sleepImplementation(pollIntervalMs);
      continue;
    }

    lastStatus = deploy.status;
    console.log(`Render deploy ${options.deployId} status: ${lastStatus}`);

    if (lastStatus === "live") {
      return deploy;
    }

    if (failedStatuses.has(lastStatus)) {
      throw new Error(`Render deploy ${options.deployId} ended with status ${lastStatus}.`);
    }

    if (!pendingStatuses.has(lastStatus)) {
      throw new Error(`Render returned unknown deploy status ${lastStatus}.`);
    }

    await sleepImplementation(POLL_INTERVAL_MS);
  }

  throw new Error(`Render deploy did not become live before the polling deadline; last status: ${lastStatus}.`);
}

function extractDigest(imageReference) {
  return imageReference.slice(imageReference.indexOf("sha256:"));
}

function verifyDeployedImage(deploy, requestedImageReference) {
  const requestedDigest = extractDigest(requestedImageReference);
  const renderImageReference = deploy.image?.ref ?? "";
  const renderImageSha = deploy.image?.sha ?? "";

  const referenceMatches = renderImageReference === requestedImageReference;
  const digestMatches =
    renderImageReference.endsWith(`@${requestedDigest}`) ||
    renderImageSha === requestedDigest ||
    renderImageSha === requestedDigest.replace("sha256:", "");

  if (!referenceMatches && !digestMatches) {
    throw new Error("Render reports a live deployment, but its image does not match the requested digest.");
  }
}

async function writeGitHubOutput(name, value) {
  const outputPath = requiredEnvironmentVariable("GITHUB_OUTPUT");
  await appendFile(outputPath, `${name}=${value}\n`, "utf8");
}

async function writeSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY?.trim();

  if (summaryPath) {
    await appendFile(summaryPath, `${lines.join("\n")}\n`, "utf8");
  }
}

async function main() {
  const apiKey = requiredEnvironmentVariable("RENDER_API_KEY");
  const serviceId = requiredEnvironmentVariable("RENDER_SERVICE_ID");
  const imageReference = requiredEnvironmentVariable("IMAGE_REF");
  const runnerTemp = requiredEnvironmentVariable("RUNNER_TEMP");

  if (!/^srv-[a-z0-9]+$/i.test(serviceId)) {
    throw new Error("RENDER_SERVICE_ID is not a Render service ID.");
  }

  if (!/^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/i.test(imageReference)) {
    throw new Error("IMAGE_REF is not an immutable GHCR digest reference.");
  }

  console.log(`Requesting Render deployment for ${imageReference}.`);

  const createdDeploy = await triggerDeploy({
    apiKey,
    serviceId,
    imageReference,
  });
  const liveDeploy = await waitForLiveDeploy({
    apiKey,
    serviceId,
    deployId: createdDeploy.id,
  });

  verifyDeployedImage(liveDeploy, imageReference);

  const metadata = {
    sourceCommit: process.env.GITHUB_SHA ?? null,
    workflowRun:
      process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null,
    requestedImage: imageReference,
    renderDeployId: liveDeploy.id,
    renderStatus: liveDeploy.status,
    renderImageRef: liveDeploy.image?.ref ?? null,
    renderImageSha: liveDeploy.image?.sha ?? null,
    verifiedAt: new Date().toISOString(),
  };
  const metadataPath = join(runnerTemp, "staging-deployment-metadata.json");

  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  await writeGitHubOutput("deploy-id", liveDeploy.id);
  await writeGitHubOutput("metadata-path", metadataPath);
  await writeSummary([
    "## Staging deployment",
    "",
    `- Render deploy: \`${liveDeploy.id}\``,
    `- Image: \`${imageReference}\``,
    "- Digest verification: passed",
  ]);

  console.log(`Verified Render deploy ${liveDeploy.id} at the requested digest.`);
}

export { extractDigest, parseJsonResponse, retrieveDeploy, triggerDeploy, verifyDeployedImage, waitForLiveDeploy };

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Deployment failed.");
    process.exitCode = 1;
  });
}
