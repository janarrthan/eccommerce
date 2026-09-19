import type { Request } from "express";
import { describe, expect, it } from "vitest";

import { establishAuthenticatedSession } from "../auth.session.js";

type SessionFailureOptions = {
  regenerateError?: Error;
  saveError?: Error;
  destroyError?: Error;
};

type SessionCallback = (error?: unknown) => void;

function createSessionRequest(options: SessionFailureOptions = {}) {
  const events: string[] = [];

  const session = {
    regenerate(callback: SessionCallback) {
      events.push("regenerate");
      callback(options.regenerateError);
      return this;
    },
    save(callback?: SessionCallback) {
      events.push("save");
      callback?.(options.saveError);
      return this;
    },
    destroy(callback: SessionCallback) {
      events.push("destroy");
      callback(options.destroyError);
      return this;
    },
  } as unknown as Request["session"];

  return {
    events,
    req: { session } as Request,
  };
}

describe("establishAuthenticatedSession", () => {
  const user = {
    id: "user-1",
    email: "customer@example.com",
  };

  it("regenerates, populates, and saves the authenticated session in order", async () => {
    const { events, req } = createSessionRequest();

    await establishAuthenticatedSession(req, user);

    expect(events).toEqual(["regenerate", "save"]);
    expect(req.session.user).toEqual(user);
    expect(req.session.csrfToken).toEqual(expect.any(String));
  });

  it("does not populate or save the session when regeneration fails", async () => {
    const { events, req } = createSessionRequest({
      regenerateError: new Error("regeneration failed"),
    });

    await expect(establishAuthenticatedSession(req, user)).rejects.toThrow("regeneration failed");

    expect(events).toEqual(["regenerate"]);
    expect(req.session.user).toBeUndefined();
    expect(req.session.csrfToken).toBeUndefined();
  });

  it("removes authenticated state and destroys the new session when saving fails", async () => {
    const { events, req } = createSessionRequest({
      saveError: new Error("save failed"),
    });

    await expect(establishAuthenticatedSession(req, user)).rejects.toThrow("save failed");

    expect(events).toEqual(["regenerate", "save", "destroy"]);
    expect(req.session.user).toBeUndefined();
    expect(req.session.csrfToken).toBeUndefined();
  });

  it("preserves both the persistence and cleanup errors", async () => {
    const { req } = createSessionRequest({
      saveError: new Error("save failed"),
      destroyError: new Error("destroy failed"),
    });

    await expect(establishAuthenticatedSession(req, user)).rejects.toThrow(
      "Failed to persist and clean up the authenticated session.",
    );
  });
});
