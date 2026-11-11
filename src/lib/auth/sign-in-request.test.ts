import { beforeEach, describe, expect, it } from "vitest";

import { givenUser } from "../../../test/factories";
import { deleteMessagesTo, messagesTo, waitForMessageTo } from "../../../test/mailpit";
import { loggedEmails, pendingLinkIds, postSignInLink } from "../../../test/sign-in";

// Requests that go straight to Better Auth, the way a script that skips the form would send
// them. The checks live in Better Auth itself, so the form cannot be the only guard.

const CALLBACKS = { callbackURL: "/", errorCallbackURL: "/login/expired" };

beforeEach(async () => {
  for (const name of [
    "anna",
    "boris",
    "person1",
    "person2",
    "person3",
    "person4",
    "person5",
    "person6",
  ]) {
    await deleteMessagesTo(`${name}@example.com`);
  }
});

describe("POST /api/auth/sign-in/magic-link", () => {
  it("Ссылка отправлена", async () => {
    const response = await postSignInLink({ email: "anna@example.com", ...CALLBACKS });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true });
    await waitForMessageTo("anna@example.com");
  });

  it("Новая и знакомая почта", async () => {
    await givenUser("anna@example.com");

    const known = await postSignInLink({ email: "anna@example.com", ...CALLBACKS });
    const fresh = await postSignInLink({ email: "boris@example.com", ...CALLBACKS });

    // Same status and same body for an address we know and for one we do not
    expect(known.status).toBe(fresh.status);
    expect(await known.json()).toEqual(await fresh.json());
    await waitForMessageTo("anna@example.com");
    await waitForMessageTo("boris@example.com");
  });

  it("Неверный адрес не из формы", async () => {
    for (const email of ["anna@", "", undefined, 42]) {
      const response = await postSignInLink({ email, ...CALLBACKS });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ message: "Проверьте адрес почты" });
    }
    // No email, no link, nothing counted
    expect(await messagesTo("anna@")).toEqual([]);
    expect(await pendingLinkIds()).toEqual([]);
    expect(await loggedEmails("anna@")).toBe(0);
  });

  it("Пробелы и большие буквы: сервер приводит адрес сам", async () => {
    const response = await postSignInLink({ email: " Anna@Example.COM ", ...CALLBACKS });

    expect(response.status).toBe(200);
    await waitForMessageTo("anna@example.com");
    expect(await pendingLinkIds("anna@example.com")).toHaveLength(1);
  });

  it("Четвёртый запрос за 10 минут: лимит и для запроса не из формы", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await postSignInLink({ email: "anna@example.com", ...CALLBACKS })).status).toBe(200);
    }
    const linksBefore = await pendingLinkIds("anna@example.com");

    const response = await postSignInLink({ email: "ANNA@example.com", ...CALLBACKS });

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      message: "Слишком часто, попробуйте через несколько минут",
    });
    expect(await messagesTo("anna@example.com")).toHaveLength(3);
    expect(await pendingLinkIds("anna@example.com")).toEqual(linksBefore);
  });

  it("Лимит устройства не из формы", async () => {
    const device = { "x-real-ip": "203.0.113.50" };
    for (const name of ["person1", "person2", "person3", "person4", "person5"]) {
      const response = await postSignInLink({ email: `${name}@example.com`, ...CALLBACKS }, device);
      expect(response.status).toBe(200);
    }

    const response = await postSignInLink({ email: "person6@example.com", ...CALLBACKS }, device);

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      message: "С этого устройства запрашивали вход на слишком много адресов. Попробуйте позже.",
    });
    expect(await messagesTo("person6@example.com")).toEqual([]);
    expect(await pendingLinkIds("person6@example.com")).toEqual([]);

    // Another device is not held back
    const other = await postSignInLink(
      { email: "person6@example.com", ...CALLBACKS },
      { "x-real-ip": "198.51.100.77" },
    );
    expect(other.status).toBe(200);
  });

  it("the device is the address the web server saw, not what the browser claims", async () => {
    // X-Forwarded-For can be written by anyone; X-Real-IP is set by nginx and wins
    for (const [index, name] of ["person1", "person2", "person3", "person4", "person5"].entries()) {
      const response = await postSignInLink(
        { email: `${name}@example.com`, ...CALLBACKS },
        { "x-real-ip": "203.0.113.60", "x-forwarded-for": `10.0.0.${index}` },
      );
      expect(response.status).toBe(200);
    }

    const response = await postSignInLink(
      { email: "person6@example.com", ...CALLBACKS },
      { "x-real-ip": "203.0.113.60", "x-forwarded-for": "10.0.0.99" },
    );

    expect(response.status).toBe(429);
  });
});
