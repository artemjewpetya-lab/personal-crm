import path from "node:path";

import { test as setup } from "./fixtures";
import { OWNER_EMAIL } from "./owner";
import { signIn } from "./sign-in";

/** Where the owner's sign-in is kept for the e2e tests that work with the owner's data. */
export const OWNER_STATE = path.resolve(__dirname, ".auth", "owner.json");

// Signs in once, under the owner's email, the way a person does. The other e2e tests start
// with this sign-in already in the browser (see the "app" project in playwright.config.ts).
setup("sign in as the owner", async ({ page }) => {
  await signIn(page, OWNER_EMAIL);
  await page.context().storageState({ path: OWNER_STATE });
});
