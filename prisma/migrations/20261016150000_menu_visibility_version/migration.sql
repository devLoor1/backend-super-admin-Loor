-- Optimistic concurrency for menu visibility Stage B
ALTER TABLE `menu_visibility_configs` ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;
