CREATE TABLE "contact_groups" (
	"contact_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "contact_groups_contact_id_group_id_pk" PRIMARY KEY("contact_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_groups_group_id_idx" ON "contact_groups" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_name_unique_idx" ON "groups" USING btree (translate(lower("name"), 'ё', 'е'));