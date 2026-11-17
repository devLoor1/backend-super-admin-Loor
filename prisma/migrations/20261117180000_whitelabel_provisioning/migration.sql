-- CreateTable
CREATE TABLE `whitelabel_provisionings` (
    `id` VARCHAR(191) NOT NULL,
    `whitelabel_id` INTEGER NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `base_url` VARCHAR(512) NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'WAITING_MANUAL_ACTION', 'FAILED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `current_step` ENUM('CREATE_TENANT', 'APPLY_SETTINGS_TEMPLATE', 'UPLOAD_BRAND', 'INITIAL_ADMIN', 'TERMS', 'SMTP', 'GATEWAY_CONFIG', 'FE_DEPLOY_CHECK', 'DNS_CHECK', 'VALIDATE', 'DELIVER') NULL,
    `requested_by` VARCHAR(191) NOT NULL,
    `correlation_id` VARCHAR(64) NULL,
    `template_from_whitelabel_id` INTEGER NULL,
    `error_code` VARCHAR(64) NULL,
    `error_message` VARCHAR(1000) NULL,
    `delivery` JSON NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `whitelabel_provisionings_slug_idx`(`slug`),
    INDEX `whitelabel_provisionings_whitelabel_id_idx`(`whitelabel_id`),
    INDEX `whitelabel_provisionings_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whitelabel_provisioning_steps` (
    `id` VARCHAR(191) NOT NULL,
    `provisioning_id` VARCHAR(191) NOT NULL,
    `key` ENUM('CREATE_TENANT', 'APPLY_SETTINGS_TEMPLATE', 'UPLOAD_BRAND', 'INITIAL_ADMIN', 'TERMS', 'SMTP', 'GATEWAY_CONFIG', 'FE_DEPLOY_CHECK', 'DNS_CHECK', 'VALIDATE', 'DELIVER') NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'WAITING_MANUAL_ACTION', 'SUCCESS', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `payload` JSON NULL,
    `result` JSON NULL,
    `last_error_code` VARCHAR(64) NULL,
    `last_error_message` VARCHAR(1000) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `whitelabel_provisioning_steps_status_idx`(`status`),
    UNIQUE INDEX `whitelabel_provisioning_steps_provisioning_id_key_key`(`provisioning_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `whitelabel_provisionings` ADD CONSTRAINT `whitelabel_provisionings_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `super_admins`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whitelabel_provisioning_steps` ADD CONSTRAINT `whitelabel_provisioning_steps_provisioning_id_fkey` FOREIGN KEY (`provisioning_id`) REFERENCES `whitelabel_provisionings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
