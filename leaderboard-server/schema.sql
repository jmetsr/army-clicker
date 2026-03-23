-- Army Clicker Leaderboard Schema
-- Run with: mysql -u army_clicker -parmy_clicker_pass army_clicker_leaderboard < schema.sql

DROP TABLE IF EXISTS game_runs;

CREATE TABLE game_runs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_name VARCHAR(50) NOT NULL,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Game mode info
    game_mode ENUM('practice', 'easy', 'medium', 'hard', 'ai_4cps', 'ai_8cps', 'ai_25cps') NOT NULL,
    cheated BOOLEAN DEFAULT FALSE,
    cheat_reason TEXT NULL,

    -- Speed milestones (day number reached, NULL if not reached)
    day_million INT UNSIGNED NULL,
    day_billion INT UNSIGNED NULL,
    day_trillion INT UNSIGNED NULL,
    day_quadrillion INT UNSIGNED NULL,
    day_quintillion INT UNSIGNED NULL,
    day_vanquish INT UNSIGNED NULL,
    day_surrender INT UNSIGNED NULL,

    -- Coin totals (stored as string for large OrdinalNumbers)
    coins_year_1 VARCHAR(100) NULL,
    coins_year_2 VARCHAR(100) NULL,
    coins_total VARCHAR(100) NULL,

    -- Raw log for verification/debugging
    game_log MEDIUMTEXT NULL,

    -- Indexes for leaderboard queries
    INDEX idx_game_mode (game_mode),
    INDEX idx_cheated (cheated),
    INDEX idx_day_million (day_million),
    INDEX idx_day_billion (day_billion),
    INDEX idx_day_trillion (day_trillion),
    INDEX idx_day_quadrillion (day_quadrillion),
    INDEX idx_day_quintillion (day_quintillion),
    INDEX idx_day_vanquish (day_vanquish),
    INDEX idx_day_surrender (day_surrender),

    -- Composite indexes for filtered leaderboard queries
    INDEX idx_mode_million (game_mode, cheated, day_million),
    INDEX idx_mode_vanquish (game_mode, cheated, day_vanquish)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample data for testing
INSERT INTO game_runs (player_name, game_mode, day_million, day_billion, day_trillion, day_vanquish, coins_year_1, coins_total) VALUES
('TestPlayer1', 'medium', 15, 45, 120, 200, '5.5e9', '1.2e15'),
('TestPlayer2', 'hard', 25, 80, 180, 350, '2.1e9', '8.5e14'),
('TestPlayer3', 'ai_25cps', 20, 60, 150, 280, '3.8e9', '9.9e14'),
('SpeedRunner', 'medium', 10, 30, 90, 150, '8.2e9', '2.5e15'),
('CasualGamer', 'easy', 30, 100, NULL, NULL, '1.1e9', '5.0e12');
