-- Three ready-made groups. A migration runs once per database, so a group the
-- owner deletes or renames is not brought back by later updates.
INSERT INTO "groups" ("name") VALUES ('Семья'), ('Друзья'), ('Коллеги');
