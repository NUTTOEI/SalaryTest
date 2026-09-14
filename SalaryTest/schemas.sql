DROP TABLE IF EXISTS `members`;
DROP TABLE IF EXISTS `settings`;

CREATE TABLE `members` (
    `id`            INT AUTO_INCREMENT PRIMARY KEY,
    `branch`        VARCHAR(100) NOT NULL DEFAULT 'comsci41',
    `name`          VARCHAR(255) NOT NULL,
    `amount`        DECIMAL(10,2) NOT NULL DEFAULT 100.00,
    `paid_months`   JSON NOT NULL,
    `paid_weeks`    JSON NOT NULL,
    `history`       JSON NOT NULL,
    `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `settings` (
    `key`           VARCHAR(64) PRIMARY KEY,
    `value`         VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `settings` (`key`, `value`) VALUES ('target_amount', '4000')
    ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
