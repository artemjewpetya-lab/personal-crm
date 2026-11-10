// Texts of the sign-in request, shown to the user (and sent back to scripts that skip the form).

export const INVALID_EMAIL = "Проверьте адрес почты";
export const TOO_MANY_EMAILS = "Слишком часто, попробуйте через несколько минут";
export const TOO_MANY_ADDRESSES =
  "С этого устройства запрашивали вход на слишком много адресов. Попробуйте позже.";
export const MAIL_NOT_SENT = "Не удалось отправить письмо. Попробуйте ещё раз через пару минут.";

/** Codes of our own errors; the form maps them back to the texts above. */
export const SIGN_IN_ERROR_CODES = {
  INVALID_EMAIL: "INVALID_EMAIL",
  TOO_MANY_EMAILS: "TOO_MANY_EMAILS",
  TOO_MANY_ADDRESSES: "TOO_MANY_ADDRESSES",
  MAIL_NOT_SENT: "MAIL_NOT_SENT",
} as const;
