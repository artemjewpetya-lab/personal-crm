import { beforeEach, describe, expect, it } from "vitest";

import {
  deleteMessagesTo,
  messagesTo,
  signInLinkOf,
  waitForMessageTo,
} from "../../../test/mailpit";

import { sendSignInEmail } from "./send";

const LINK = "http://localhost:3000/api/auth/magic-link/verify?token=abc";

describe("sendSignInEmail", () => {
  beforeEach(async () => {
    await deleteMessagesTo("anna@example.com");
  });

  it("Что в письме: отправитель, тема и текст в настоящей почтовой заглушке", async () => {
    await sendSignInEmail("anna@example.com", LINK);

    const message = await waitForMessageTo("anna@example.com");
    expect(message.from).toEqual({
      name: "Личная CRM",
      address: process.env.MAIL_FROM_ADDRESS,
    });
    expect(message.to).toEqual(["anna@example.com"]);
    expect(message.subject).toBe("Вход в Личную CRM");
    expect(message.html).toContain("Войти");
    expect(message.text).toContain("15 минут");
    expect(message.text).toContain("Если вы не запрашивали вход - просто проигнорируйте письмо");
    expect(signInLinkOf(message)).toBe(LINK);
  });

  it("sends exactly one email per call", async () => {
    await sendSignInEmail("anna@example.com", LINK);

    await waitForMessageTo("anna@example.com");
    expect(await messagesTo("anna@example.com")).toHaveLength(1);
  });
});
