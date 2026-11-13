export const SIGN_IN_EMAIL_SUBJECT = "Вход в Личную CRM";

/** The test stand marks its emails, so they are not taken for emails from prod. */
const TEST_STAND_SUBJECT = `[Тест] ${SIGN_IN_EMAIL_SUBJECT}`;
const TEST_STAND_TITLE = "Личная CRM · тест-стенд";
const TITLE = "Личная CRM";

const IGNORE_LINE = "Если вы не запрашивали вход - просто проигнорируйте письмо";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The sign-in email: subject, HTML with the "Войти" button and a plain-text version.
 * Pure function, so the wording is checked without sending anything.
 * Colors are the app's brand colors (src/app/globals.css); email clients ignore CSS variables.
 * `testStand`: the email goes from the test stand, with a mark in the subject and at the top.
 */
export function buildSignInEmail(
  url: string,
  { testStand = false }: { testStand?: boolean } = {},
): { subject: string; html: string; text: string } {
  const href = escapeHtml(url);
  const title = testStand ? TEST_STAND_TITLE : TITLE;

  const html = `<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:24px;background:#f5ece7;font-family:Onest,Arial,sans-serif;color:#1b2963;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fffbf8;border:1px solid #e6d6cf;border-radius:28px;">
      <tr>
        <td style="padding:36px;">
          <p style="margin:0 0 24px;font-size:17px;font-weight:600;">${title}</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">Чтобы войти, нажмите кнопку. Ссылка работает 15 минут и открывается один раз.</p>
          <p style="margin:0 0 24px;">
            <a href="${href}" style="display:inline-block;padding:14px 32px;border-radius:16px;background:#58304c;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Войти</a>
          </p>
          <p style="margin:0;padding-top:20px;border-top:1px solid #e6d6cf;font-size:14px;line-height:1.45;color:#5a5f80;">${IGNORE_LINE}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${testStand ? `${TEST_STAND_TITLE}\n\n` : ""}Чтобы войти, откройте ссылку. Она работает 15 минут и открывается один раз.

${url}

${IGNORE_LINE}
`;

  return { subject: testStand ? TEST_STAND_SUBJECT : SIGN_IN_EMAIL_SUBJECT, html, text };
}
