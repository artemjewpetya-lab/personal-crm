import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { givenUser } from "../../../test/factories";
import {
  deleteMessagesTo,
  messagesTo,
  signInLinkOf,
  waitForMessageTo,
} from "../../../test/mailpit";
import { setRequestHeaders } from "../../../test/request-context";
import {
  ageOldestLoggedEmail,
  closedPort,
  loggedEmails,
  pendingLinkIds,
} from "../../../test/sign-in";

import { auth } from "@/lib/auth/auth";

import { requestSignInLink } from "./actions";

const INVALID_EMAIL = "Проверьте адрес почты";
const TOO_OFTEN = "Слишком часто, попробуйте через несколько минут";
const TOO_MANY_ADDRESSES =
  "С этого устройства запрашивали вход на слишком много адресов. Попробуйте позже.";
const NOT_SENT = "Не удалось отправить письмо. Попробуйте ещё раз через пару минут.";

const PEOPLE = ["anna", "boris", "person1", "person2", "person3", "person4", "person5", "person6"];
const address = (name: string) => `${name}@example.com`;

beforeEach(async () => {
  for (const name of PEOPLE) await deleteMessagesTo(address(name));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("requestSignInLink", () => {
  it("Ссылка отправлена", async () => {
    const result = await requestSignInLink("anna@example.com");

    expect(result).toEqual({ ok: true, data: { email: "anna@example.com" } });
    const message = await waitForMessageTo("anna@example.com");
    expect(signInLinkOf(message)).toContain("/api/auth/magic-link/verify?token=");
    expect(await messagesTo("anna@example.com")).toHaveLength(1);
  });

  it("Новая и знакомая почта", async () => {
    await givenUser("anna@example.com");

    const known = await requestSignInLink("anna@example.com");
    const fresh = await requestSignInLink("boris@example.com");

    // The same kind of answer, so nothing tells whether the user exists
    expect(known).toEqual({ ok: true, data: { email: "anna@example.com" } });
    expect(fresh).toEqual({ ok: true, data: { email: "boris@example.com" } });
    await waitForMessageTo("anna@example.com");
    await waitForMessageTo("boris@example.com");
  });

  it("Пробелы и большие буквы", async () => {
    const result = await requestSignInLink(" Anna@Example.COM ");

    expect(result).toEqual({ ok: true, data: { email: "anna@example.com" } });
    await waitForMessageTo("anna@example.com");
    expect(await pendingLinkIds("anna@example.com")).toHaveLength(1);
  });

  it("Неверный адрес в форме", async () => {
    const result = await requestSignInLink("anna@");

    expect(result).toEqual({ ok: false, fieldErrors: { email: INVALID_EMAIL } });
    expect(await messagesTo("anna@")).toEqual([]);
    expect(await pendingLinkIds()).toEqual([]);
    expect(await loggedEmails("anna@")).toBe(0);
  });

  it("Пустое поле", async () => {
    const result = await requestSignInLink("");

    expect(result).toEqual({ ok: false, fieldErrors: { email: INVALID_EMAIL } });
    expect(await pendingLinkIds()).toEqual([]);
  });

  it("Четвёртый запрос за 10 минут", async () => {
    for (let i = 0; i < 3; i++) {
      expect(await requestSignInLink("anna@example.com")).toMatchObject({ ok: true });
    }
    const linksBefore = await pendingLinkIds("anna@example.com");

    const result = await requestSignInLink("anna@example.com");

    expect(result).toEqual({ ok: false, fieldErrors: { email: TOO_OFTEN } });
    expect(await messagesTo("anna@example.com")).toHaveLength(3);
    // The new link was not made, and the earlier ones were not cancelled
    expect(await pendingLinkIds("anna@example.com")).toEqual(linksBefore);
    // (each new link cancels the earlier ones, so before the fourth request one link was left)
    expect(linksBefore).toHaveLength(1);
  });

  it("Через 10 минут снова можно", async () => {
    for (let i = 0; i < 3; i++) await requestSignInLink("anna@example.com");
    await ageOldestLoggedEmail("anna@example.com", 11);

    const result = await requestSignInLink("anna@example.com");

    expect(result).toEqual({ ok: true, data: { email: "anna@example.com" } });
    expect(await messagesTo("anna@example.com")).toHaveLength(4);
  });

  it("Другая почта не ждёт", async () => {
    for (let i = 0; i < 3; i++) await requestSignInLink("anna@example.com");

    const result = await requestSignInLink("boris@example.com");

    expect(result).toEqual({ ok: true, data: { email: "boris@example.com" } });
    await waitForMessageTo("boris@example.com");
  });

  it("Та же почта, написанная иначе", async () => {
    for (let i = 0; i < 3; i++) await requestSignInLink("anna@example.com");

    const result = await requestSignInLink("Anna@Example.com");

    expect(result).toEqual({ ok: false, fieldErrors: { email: TOO_OFTEN } });
    expect(await messagesTo("anna@example.com")).toHaveLength(3);
  });

  describe("с одного устройства", () => {
    const device = "203.0.113.7";

    async function requestFiveAddresses() {
      setRequestHeaders({ "x-real-ip": device });
      for (const name of PEOPLE.slice(2, 7)) {
        expect(await requestSignInLink(address(name))).toMatchObject({ ok: true });
      }
    }

    it("Шестой адрес за час", async () => {
      await requestFiveAddresses();

      const result = await requestSignInLink(address("person6"));

      expect(result).toEqual({ ok: false, fieldErrors: { email: TOO_MANY_ADDRESSES } });
      expect(await messagesTo(address("person6"))).toEqual([]);
      expect(await pendingLinkIds(address("person6"))).toEqual([]);
      expect(await loggedEmails(address("person6"))).toBe(0);
    });

    it("Адрес из этих пяти", async () => {
      await requestFiveAddresses();

      const result = await requestSignInLink("Person1@Example.com");

      expect(result).toEqual({ ok: true, data: { email: address("person1") } });
      expect(await messagesTo(address("person1"))).toHaveLength(2);
    });

    it("Через час снова можно", async () => {
      await requestFiveAddresses();
      await ageOldestLoggedEmail(address("person1"), 61);

      const result = await requestSignInLink(address("person6"));

      expect(result).toEqual({ ok: true, data: { email: address("person6") } });
      await waitForMessageTo(address("person6"));
    });

    it("Другое устройство не ждёт", async () => {
      await requestFiveAddresses();

      setRequestHeaders({ "x-real-ip": "198.51.100.23" });
      const result = await requestSignInLink(address("person6"));

      expect(result).toEqual({ ok: true, data: { email: address("person6") } });
      await waitForMessageTo(address("person6"));
    });
  });

  it("Почтовый сервер недоступен", async () => {
    // Anna already has a valid link from an earlier email
    await requestSignInLink("anna@example.com");
    const earlierMail = await waitForMessageTo("anna@example.com");
    const earlierLinks = await pendingLinkIds("anna@example.com");
    expect(earlierLinks).toHaveLength(1);

    // The mail server goes down: nothing listens on the port
    vi.stubEnv("SMTP_PORT", String(await closedPort()));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await requestSignInLink("anna@example.com");

    expect(result).toEqual({ ok: false, fieldErrors: { email: NOT_SENT } });
    expect(errors).toHaveBeenCalled();
    // The earlier link is still the only one, and this attempt is not counted in the limits
    expect(await pendingLinkIds("anna@example.com")).toEqual(earlierLinks);
    expect(await loggedEmails("anna@example.com")).toBe(1);
    // ... and it still lets Anna in
    const response = await auth.handler(new Request(signInLinkOf(earlierMail)));
    expect(response.status).toBe(302);
    expect(response.headers.get("set-cookie")).toMatch(/session_token=/);
  });
});
