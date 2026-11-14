// Must stay the first import: it points the app at a database that is not there.
import { expectNoConnection } from "../../../test/unavailable-database";

import { inspect } from "node:util";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { redactDatabaseErrors } from "@/db/errors";
import { SAVE_FAILED } from "@/lib/contacts/messages";

import { actAs } from "../../../test/current-user";

import { addNote, updateContactFrequency } from "./actions";

// Somebody is signed in; what fails here is the database behind the action.
vi.mock("@/lib/auth/current-user", () => import("../../../test/current-user"));

const CONTACT_ID = "7d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10";
const NOTE = "Созвонились с Иваном, телефон +7 999 123-45-67";

describe("database unavailable", () => {
  beforeEach(() => {
    actAs({ id: "0d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10", email: "owner@example.com" });
    // The actions log the real error; it is expected here.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("addNote answers with «Не удалось сохранить…»", async () => {
    await expectNoConnection();

    const result = await addNote(CONTACT_ID, { body: "Позвонил" });

    expect(result).toEqual({ ok: false, formError: SAVE_FAILED });
  });

  it("addNote: the log gets the error itself, not the text of the note", async () => {
    await expectNoConnection();
    const logged = vi.mocked(console.error);
    const { error, warn } = console;
    // What src/instrumentation.ts does when the server starts.
    redactDatabaseErrors(console);

    try {
      await addNote(CONTACT_ID, { body: NOTE });
    } finally {
      Object.assign(console, { error, warn });
    }

    const log = logged.mock.calls
      .flat()
      .map((arg) => inspect(arg))
      .join("\n");
    expect(log).toContain("ECONNREFUSED");
    expect(log).not.toContain(NOTE);
  });

  it("updateContactFrequency answers with «Не удалось сохранить…»", async () => {
    await expectNoConnection();

    const result = await updateContactFrequency(CONTACT_ID, "week");

    expect(result).toEqual({ ok: false, formError: SAVE_FAILED });
  });
});
