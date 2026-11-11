-- Gives every existing contact and group an owner.
--
-- The owner is the user with the email from the OWNER_EMAIL setting. scripts/migrate.mts passes it
-- as the session setting "app.owner_email" on the same connection that applies the migrations.
-- All migrations run in one transaction, so if this one fails nothing in the database changes.
--
-- Contacts and groups exist on every database that went through 0003 (it adds three ready-made
-- groups), so in practice OWNER_EMAIL is always required. Notes and contact-to-group links have
-- no owner column: they belong to their contact and group.
DO $migration$
DECLARE
  owner_email text := lower(btrim(coalesce(current_setting('app.owner_email', true), '')));
  owner_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM "contacts") OR EXISTS (SELECT 1 FROM "groups") THEN
    IF owner_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'OWNER_EMAIL is not set or is not an email address: the existing contacts and groups cannot be given to their owner. Set OWNER_EMAIL and run the update again.';
    END IF;

    -- email_verified = true, otherwise the first sign-in by link would treat the address as unconfirmed
    INSERT INTO "users" ("name", "email", "email_verified")
    VALUES ('', owner_email, true)
    ON CONFLICT ("email") DO NOTHING;

    SELECT "id" INTO owner_id FROM "users" WHERE "email" = owner_email;

    UPDATE "contacts" SET "user_id" = owner_id WHERE "user_id" IS NULL;
    UPDATE "groups" SET "user_id" = owner_id WHERE "user_id" IS NULL;
  END IF;
END
$migration$;
--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "contacts_name_idx";--> statement-breakpoint
CREATE INDEX "contacts_user_id_name_idx" ON "contacts" USING btree ("user_id","name");--> statement-breakpoint
DROP INDEX "groups_name_unique_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "groups_user_id_name_unique_idx" ON "groups" USING btree ("user_id",translate(lower("name"), 'ё', 'е'));
