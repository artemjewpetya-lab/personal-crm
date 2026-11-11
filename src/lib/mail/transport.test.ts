import { describe, expect, it } from "vitest";

import { readSmtpSettings } from "./transport";

describe("readSmtpSettings", () => {
  it("Та же сборка, другие настройки: заглушка без логина", () => {
    // What the owner's computer and the tests use: the mail catcher, no login, no encryption
    expect(
      readSmtpSettings({
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "1025",
        SMTP_USER: "",
        SMTP_PASSWORD: "",
      }),
    ).toEqual({ host: "127.0.0.1", port: 1025, secure: false });
  });

  it("Та же сборка, другие настройки: настоящий почтовый сервер с логином", () => {
    // What the server uses: Resend over SMTP, port 465 means encrypted from the first byte
    expect(
      readSmtpSettings({
        SMTP_HOST: "smtp.resend.com",
        SMTP_PORT: "465",
        SMTP_USER: "resend",
        SMTP_PASSWORD: "re_secret_key",
      }),
    ).toEqual({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: { user: "resend", pass: "re_secret_key" },
    });
  });

  it("settings that are not set stop with a clear message", () => {
    expect(() => readSmtpSettings({ SMTP_PORT: "1025" })).toThrow(/SMTP_HOST/);
    expect(() => readSmtpSettings({ SMTP_HOST: "127.0.0.1" })).toThrow(/SMTP_PORT/);
    expect(() => readSmtpSettings({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "abc" })).toThrow(
      /SMTP_PORT/,
    );
  });
});
