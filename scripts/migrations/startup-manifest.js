const STARTUP_MIGRATION_GROUPS = [
  {
    key: 'bootstrap',
    label: 'Bootstrap baseline',
    files: [
      'init-db.js'
    ]
  },
  {
    key: 'historical-core-patches',
    label: 'Historical core patches',
    files: [
      'fix-db-schema.js',
      'migrate-ar-image.js',
      'migrate-task-system.js',
      'migrate-task-type.js',
      'migrate-user-roles.js',
      'migrate-quest-chain-owner.js',
      'migrate-item-system.js',
      'migrate-points-table.js',
      'fix-product-schema.js',
      'migrate-quest-final-step.js',
      'add-ai-task-support.js'
    ]
  },
  {
    key: 'sandhill-product-model',
    label: 'Sandhill product model',
    files: [
      'migrate-sandhill-blueprint.js',
      'migrate-quest-chain-experience-mode.js',
      'migrate-coupon-entry-access.js',
      'slim-sandhill-legacy-columns.js'
    ]
  },
  {
    key: 'platform-commercial-layer',
    label: 'Platform and commercial layer',
    files: [
      'migrate-shop-platform.js'
    ]
  },
  {
    key: 'operational-current-patch',
    label: 'Operational current patch',
    files: [
      'migrate-operational-schema.js'
    ]
  }
];

const STARTUP_MIGRATIONS = STARTUP_MIGRATION_GROUPS.flatMap((group) => group.files);

module.exports = {
  STARTUP_MIGRATION_GROUPS,
  STARTUP_MIGRATIONS
};
