import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Relative import: drizzle-kit and the seed script load this file without the "@/" alias.
import { CONTACT_FREQUENCIES } from "../lib/contacts/frequency";

export const contactFrequency = pgEnum("contact_frequency", CONTACT_FREQUENCIES);

// Sign-in tables: users, sessions, accounts and verifications follow what Better Auth expects
// (see node_modules/better-auth, "get-tables"); only the column names are snake_case.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Sign-in by link never asks for a name, so it stays empty.
  name: text("name").notNull(),
  // Always stored trimmed and in lower case.
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// One row per browser or device that is signed in.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

// Not used by sign-in by link, but Better Auth checks that the table exists.
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

// One-time sign-in links: Better Auth keeps a fingerprint of the link here until it is used or expires.
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

// One row per sign-in email that was sent. Both limits count these rows
// (3 per address in 10 minutes, 5 different addresses per device in an hour).
// Rows older than an hour are deleted, so device addresses are not kept longer.
export const signInEmails = pgTable(
  "sign_in_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    // The address the request came from; "unknown" when the server could not tell.
    ipAddress: text("ip_address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sign_in_emails_email_created_at_idx").on(table.email, table.createdAt),
    index("sign_in_emails_ip_address_created_at_idx").on(table.ipAddress, table.createdAt),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Whose contact it is. Deleting a user row must not take the contacts with it.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The list is always "mine, by name".
  (table) => [index("contacts_user_id_name_idx").on(table.userId, table.name)],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notes_contact_id_created_at_idx").on(table.contactId, table.createdAt)],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Two names that differ only in letter case or "е"/"ё" are the same name for one user;
    // different users may have groups with the same name.
    // The database checks it, so two simultaneous requests cannot create a twin.
    uniqueIndex("groups_user_id_name_unique_idx").on(
      table.userId,
      sql`translate(lower(${table.name}), 'ё', 'е')`,
    ),
  ],
);

// Which contact is in which group. Deleting either side removes only the link.
export const contactGroups = pgTable(
  "contact_groups",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.contactId, table.groupId] }),
    // For the filter on the home page: contacts of one group.
    index("contact_groups_group_id_idx").on(table.groupId),
  ],
);

export type User = typeof users.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
