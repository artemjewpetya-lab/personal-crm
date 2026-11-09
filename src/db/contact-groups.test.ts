import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { contactGroups, contacts, groups } from "@/db/schema";

describe("contact groups", () => {
  it("Удалили контакт", async () => {
    const [anna, boris] = await db
      .insert(contacts)
      .values([{ name: "Анна" }, { name: "Борис" }])
      .returning({ id: contacts.id });
    const [tennis] = await db
      .insert(groups)
      .values({ name: "Теннис" })
      .returning({ id: groups.id });
    await db.insert(contactGroups).values([
      { contactId: anna.id, groupId: tennis.id },
      { contactId: boris.id, groupId: tennis.id },
    ]);

    await db.delete(contacts).where(eq(contacts.id, anna.id));

    const remaining = await db
      .select()
      .from(contactGroups)
      .where(eq(contactGroups.groupId, tennis.id));
    expect(remaining).toEqual([{ contactId: boris.id, groupId: tennis.id }]);
    expect(await db.select().from(groups)).toHaveLength(1);
  });
});
