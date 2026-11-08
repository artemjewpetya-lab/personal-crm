import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Relative import: drizzle-kit and the seed script load this file without the "@/" alias.
import { CONTACT_FREQUENCIES } from "../lib/contacts/frequency";

export const contactFrequency = pgEnum("contact_frequency", CONTACT_FREQUENCIES);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Who the person is: role, relation to the owner, etc.
    about: text("about"),
    howWeMet: text("how_we_met"),
    phone: text("phone"),
    email: text("email"),
    // Empty means "not set": the contact never shows up in "Пора связаться".
    contactFrequency: contactFrequency("contact_frequency"),
    // When the frequency was set or changed. A contact without notes is due
    // counting from this moment. Empty when the frequency is not set.
    contactFrequencySetAt: timestamp("contact_frequency_set_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("contacts_name_idx").on(table.name)],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notes_contact_id_created_at_idx").on(
      table.contactId,
      table.createdAt,
    ),
  ],
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
