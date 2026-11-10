// Must stay the first import: it points the app at a database that is not there.
import { expectNoConnection } from "../../../test/unavailable-database";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE_FAILED, SAVE_FAILED } from "@/lib/contacts/messages";

import { actAs } from "../../../test/current-user";

import {
  addContactToGroup,
  createGroup,
  createGroupForContact,
  deleteGroup,
  removeContactFromGroup,
  renameGroup,
} from "./actions";

// Somebody is signed in; what fails here is the database behind the action.
vi.mock("@/lib/auth/current-user", () => import("../../../test/current-user"));

const GROUP_ID = "7d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10";

describe("database unavailable", () => {
  beforeEach(() => {
    actAs({ id: "0d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10", email: "owner@example.com" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("Не удалось создать", async () => {
    await expectNoConnection();

    expect(await createGroup("Аналитики")).toEqual({ ok: false, formError: SAVE_FAILED });
  });

  it("Не удалось переименовать", async () => {
    await expectNoConnection();

    expect(await renameGroup(GROUP_ID, "Аналитики")).toEqual({ ok: false, formError: SAVE_FAILED });
  });

  it("Не удалось удалить", async () => {
    await expectNoConnection();

    expect(await deleteGroup(GROUP_ID)).toEqual({ ok: false, formError: DELETE_FAILED });
  });

  it("Не удалось сохранить: отметка в карточке", async () => {
    await expectNoConnection();

    expect(await addContactToGroup(GROUP_ID, GROUP_ID)).toEqual({
      ok: false,
      formError: SAVE_FAILED,
    });
    expect(await removeContactFromGroup(GROUP_ID, GROUP_ID)).toEqual({
      ok: false,
      formError: SAVE_FAILED,
    });
  });

  it("Не удалось сохранить: новая группа из карточки", async () => {
    await expectNoConnection();

    expect(await createGroupForContact(GROUP_ID, "Теннис")).toEqual({
      ok: false,
      formError: SAVE_FAILED,
    });
  });
});
