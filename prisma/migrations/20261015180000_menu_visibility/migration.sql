-- Global Super Admin menu visibility (Control Plane only)
CREATE TABLE `menu_visibility_configs` (
    `id` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(32) NOT NULL DEFAULT 'global',
    `visibility` JSON NOT NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
