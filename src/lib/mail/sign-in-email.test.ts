import { describe, expect, it } from "vitest";

import { buildSignInEmail } from "./sign-in-email";

const LINK = "http://localhost:3000/api/auth/magic-link/verify?token=abc&callbackURL=%2F";

describe("buildSignInEmail", () => {
  it("Что в письме: тема, кнопка со ссылкой, срок и строка про игнор", () => {
    const { subject, html, text } = buildSignInEmail(LINK);

    expect(subject).toBe("Вход в Личную CRM");

    // The button "Войти" is a link to the sign-in address (& is written as &amp; in HTML)
    expect(html).toMatch(
      /<a [^>]*href="http:\/\/localhost:3000\/api\/auth\/magic-link\/verify\?token=abc&amp;callbackURL=%2F"[^>]*>\s*Войти\s*<\/a>/,
    );
    expect(html).toContain("15 минут");
    expect(html).toContain("Если вы не запрашивали вход - просто проигнорируйте письмо");

    // The plain-text version has the same link and the same sentences
    expect(text).toContain(LINK);
    expect(text).toContain("15 минут");
    expect(text).toContain("Если вы не запрашивали вход - просто проигнорируйте письмо");

    // Without the test stand flag there is no test mark
    expect(html).not.toContain("тест-стенд");
    expect(text).not.toContain("тест-стенд");
  });

  it("Письмо с тест-стенда: пометка в теме и вверху письма", () => {
    const { subject, html, text } = buildSignInEmail(LINK, { testStand: true });

    expect(subject).toBe("[Тест] Вход в Личную CRM");

    // The top line of the letter, in both versions
    expect(html).toMatch(/<p [^>]*>Личная CRM · тест-стенд<\/p>/);
    expect(text.split("\n")[0]).toBe("Личная CRM · тест-стенд");

    // The rest of the letter is the same: the button with the link, the lifetime
    expect(html).toMatch(/<a [^>]*href="[^"]*token=abc[^"]*"[^>]*>\s*Войти\s*<\/a>/);
    expect(text).toContain(LINK);
    expect(text).toContain("15 минут");
  });

  it("escapes the link in the HTML version", () => {
    // The link is built by our own server, but it is still escaped in HTML
    const { html } = buildSignInEmail('http://localhost:3000/?x="><script>alert(1)</script>');

    expect(html).not.toContain("<script>");
  });
});
