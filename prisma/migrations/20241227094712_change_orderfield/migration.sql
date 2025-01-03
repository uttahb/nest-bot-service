-- CreateTable
CREATE TABLE `chats` (
    `uuid` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`uuid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_history` (
    `uuid` VARCHAR(191) NOT NULL,
    `chat_id` VARCHAR(191) NOT NULL,
    `query` TEXT NOT NULL,
    `response` TEXT NOT NULL,
    `order` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`uuid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `chat_history` ADD CONSTRAINT `chat_history_chat_id_fkey` FOREIGN KEY (`chat_id`) REFERENCES `chats`(`uuid`) ON DELETE CASCADE ON UPDATE CASCADE;
