-- AlterEnum: add CONFIGURE_FRONTEND_DOMAINS to provisioning step keys
ALTER TABLE `whitelabel_provisionings`
  MODIFY `current_step` ENUM(
    'CREATE_TENANT',
    'APPLY_SETTINGS_TEMPLATE',
    'UPLOAD_BRAND',
    'INITIAL_ADMIN',
    'TERMS',
    'SMTP',
    'GATEWAY_CONFIG',
    'CONFIGURE_FRONTEND_DOMAINS',
    'FE_DEPLOY_CHECK',
    'DNS_CHECK',
    'VALIDATE',
    'DELIVER'
  ) NULL;

ALTER TABLE `whitelabel_provisioning_steps`
  MODIFY `key` ENUM(
    'CREATE_TENANT',
    'APPLY_SETTINGS_TEMPLATE',
    'UPLOAD_BRAND',
    'INITIAL_ADMIN',
    'TERMS',
    'SMTP',
    'GATEWAY_CONFIG',
    'CONFIGURE_FRONTEND_DOMAINS',
    'FE_DEPLOY_CHECK',
    'DNS_CHECK',
    'VALIDATE',
    'DELIVER'
  ) NOT NULL;
