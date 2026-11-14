import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import { db } from "@/db/client";
import { contacts } from "@/db/schema";

import { describeDatabaseError, redactDatabaseErrors, withoutQueryValues } from "./errors";

// What a person typed into the contact form: none of it may reach the server log.
const NAME = "Иван Петров";
const PHONE = "+7 999 123-45-67";
const EMAIL = "ivan.petrov@example.com";

/** The error the query really fails with. */
async function failureOf(query: PromiseLike<unknown>): Promise<unknown> {
  try {
    await query;
  } catch (error) {
    return error;
  }
  throw new Error("The query was expected to fail");
}

/** A contact of a user that does not exist: Postgres refuses it (foreign key). */
async function foreignKeyFailure(missingUserId: string): Promise<unknown> {
  return failureOf(
    db.insert(contacts).values({ userId: missingUserId, name: NAME, phone: PHONE, email: EMAIL }),
  );
}

// Nobody listens on port 1: the connection really fails.
const unreachable = new Pool({ connectionString: "postgres://nobody:nothing@127.0.0.1:1/none" });

afterAll(async () => {
  await unreachable.end();
});

describe("describeDatabaseError", () => {
  it("keeps the code and the message of Postgres, drops the query and its values", async () => {
    const missingUserId = randomUUID();
    const error = await foreignKeyFailure(missingUserId);

    const text = describeDatabaseError(error);

    expect(text).toMatch(/^Database error 23503: insert or update on table "contacts"/);
    for (const value of [NAME, PHONE, EMAIL, missingUserId, "Failed query", "params"]) {
      expect(text).not.toContain(value);
    }
  });

  it("keeps where it failed: the stack lines", async () => {
    const text = describeDatabaseError(await foreignKeyFailure(randomUUID()));

    expect(text).toMatch(/\n {4}at /);
  });

  it("no connection: the driver's error, without the values", async () => {
    const error = await failureOf(
      drizzle(unreachable).insert(contacts).values({ userId: randomUUID(), name: NAME }),
    );

    const text = describeDatabaseError(error);

    expect(text).toMatch(/^Database error ECONNREFUSED: .*ECONNREFUSED/);
    expect(text).not.toContain(NAME);
  });
});

describe("withoutQueryValues", () => {
  it("replaces a database error with its description", async () => {
    const error = await foreignKeyFailure(randomUUID());

    expect(withoutQueryValues(error)).toBe(describeDatabaseError(error));
  });

  it("finds a database error inside another error", async () => {
    const error = new Error("Session lookup failed", {
      cause: await foreignKeyFailure(randomUUID()),
    });

    const logged = withoutQueryValues(error);

    expect(logged).toEqual(expect.stringMatching(/^Database error 23503: /));
    expect(logged).not.toContain(NAME);
  });

  it("leaves everything else as it is", () => {
    const error = new Error("Mail server did not answer");
    const details = { status: 503 };

    expect(withoutQueryValues(error)).toBe(error);
    expect(withoutQueryValues("Failed to add note")).toBe("Failed to add note");
    expect(withoutQueryValues(details)).toBe(details);
    expect(withoutQueryValues(undefined)).toBeUndefined();
  });
});

describe("redactDatabaseErrors", () => {
  it("console.error and console.warn pass the description on instead of the error", async () => {
    const target = { error: vi.fn(), warn: vi.fn() };
    const { error: originalError, warn: originalWarn } = target;
    const error = await foreignKeyFailure(randomUUID());

    redactDatabaseErrors(target);
    target.error("Failed to create contact", error);
    target.warn("Slow query", error);

    expect(originalError).toHaveBeenCalledWith(
      "Failed to create contact",
      describeDatabaseError(error),
    );
    expect(originalWarn).toHaveBeenCalledWith("Slow query", describeDatabaseError(error));
  });
});
