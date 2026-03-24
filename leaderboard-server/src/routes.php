<?php
/**
 * Route definitions
 */

// Log to local file for easier debugging
ini_set('error_log', __DIR__ . '/../debug.log');

require_once __DIR__ . '/LogParser.php';
require_once __DIR__ . '/BasicValidator.php';
require_once __DIR__ . '/EarlyGameValidator.php';
require_once __DIR__ . '/MiddleGameValidator.php';
require_once __DIR__ . '/LateGameValidator.php';

function route(string $method, string $uri): void {
    // API routes
    if ($uri === '/api/submit-run' && $method === 'POST') {
        handleSubmitRun();
        return;
    }

    if ($uri === '/api/leaderboard' && $method === 'GET') {
        handleGetLeaderboard();
        return;
    }

    // Page routes
    if ($uri === '/' || $uri === '') {
        renderHome();
        return;
    }

    if ($uri === '/leaderboards') {
        renderLeaderboards();
        return;
    }

    // 404
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
}

function handleSubmitRun(): void {
    header('Content-Type: application/json');

    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        echo json_encode([
            'success' => false,
            'message' => 'Invalid JSON body'
        ]);
        return;
    }

    // Required fields
    $playerName = trim($input['playerName'] ?? '');
    $gameLog = $input['gameLog'] ?? null;

    if (empty($playerName)) {
        echo json_encode([
            'success' => false,
            'message' => 'Player name is required'
        ]);
        return;
    }

    // Sanitize player name: limit to 50 chars, strip HTML
    $playerName = substr(strip_tags($playerName), 0, 50);

    if (!$gameLog || !is_array($gameLog)) {
        echo json_encode([
            'success' => false,
            'message' => 'Game log is required'
        ]);
        return;
    }

    // Parse the game log and extract milestones
    $parser = new LogParser();
    if (!$parser->parseArray($gameLog)) {
        echo json_encode([
            'success' => false,
            'message' => 'Failed to parse game log: ' . $parser->getError()
        ]);
        return;
    }

    $milestones = $parser->extractMilestones();

    // Validate and normalize game mode to match DB ENUM
    $validModes = ['practice', 'easy', 'medium', 'hard', 'ai_4cps', 'ai_8cps', 'ai_25cps'];
    $gameMode = $milestones['gameMode'];
    if (!in_array($gameMode, $validModes)) {
        $gameMode = 'medium'; // Default fallback
    }

    // Log the submission for debugging
    error_log("Leaderboard submission: $playerName ($gameMode) - day {$milestones['finalDay']}, coins: {$milestones['finalCoins']}");

    // Run basic validation (anti-cheat)
    error_log("=== LEADERBOARD SUBMISSION: $playerName ($gameMode) ===");
    $validator = new BasicValidator($parser);
    $validationResult = $validator->validate();
    error_log("BasicValidator flags: " . json_encode($validationResult->flags));

    // Run early game replay validation (07g)
    error_log("Running EarlyGameValidator...");
    $earlyGameValidator = new EarlyGameValidator($parser);
    $earlyGameFlags = $earlyGameValidator->validate();
    error_log("EarlyGame flags count: " . count($earlyGameFlags));
    foreach ($earlyGameFlags as $flag) {
        $validationResult->addFlag("[EarlyGame] $flag");
    }

    // Run middle game replay validation (07h)
    error_log("Running MiddleGameValidator...");
    $middleGameValidator = new MiddleGameValidator($parser);
    $middleGameFlags = $middleGameValidator->validate();
    error_log("MiddleGame flags count: " . count($middleGameFlags));
    foreach ($middleGameFlags as $flag) {
        $validationResult->addFlag("[MiddleGame] $flag");
    }

    // Run late game validation (07i)
    error_log("Running LateGameValidator...");
    $lateGameValidator = new LateGameValidator($parser);
    $lateGameFlags = $lateGameValidator->validate();
    error_log("LateGame flags count: " . count($lateGameFlags));
    foreach ($lateGameFlags as $flag) {
        $validationResult->addFlag("[LateGame] $flag");
    }

    // Flag as cheated if any issues found
    $cheated = count($validationResult->flags) >= 1;
    error_log("Total flags: " . count($validationResult->flags) . ", cheated: " . ($cheated ? "YES" : "NO"));
    error_log("All flags: " . json_encode($validationResult->flags));
    $cheatReason = !empty($validationResult->flags) ? implode('; ', $validationResult->flags) : null;

    if ($cheated) {
        error_log("FLAGGED as cheater: $playerName - " . $cheatReason);
    }

    // Store in database
    try {
        $db = getDB();

        $stmt = $db->prepare("
            INSERT INTO game_runs (
                player_name, game_mode, cheated, cheat_reason,
                day_million, day_billion, day_trillion,
                day_quadrillion, day_quintillion,
                day_vanquish, day_surrender,
                coins_year_1, coins_year_2, coins_total,
                game_log
            ) VALUES (
                :player_name, :game_mode, :cheated, :cheat_reason,
                :day_million, :day_billion, :day_trillion,
                :day_quadrillion, :day_quintillion,
                :day_vanquish, :day_surrender,
                :coins_year_1, :coins_year_2, :coins_total,
                :game_log
            )
        ");

        $stmt->execute([
            ':player_name' => $playerName,
            ':game_mode' => $gameMode,
            ':cheated' => $cheated ? 1 : 0,
            ':cheat_reason' => $cheatReason,
            ':day_million' => $milestones['dayMillionCoins'],
            ':day_billion' => $milestones['dayBillionCoins'],
            ':day_trillion' => $milestones['dayTrillionCoins'],
            ':day_quadrillion' => $milestones['dayQuadrillionCoins'],
            ':day_quintillion' => $milestones['dayQuintillionCoins'],
            ':day_vanquish' => $milestones['dayVanquish'],
            ':day_surrender' => $milestones['daySurrender'],
            ':coins_year_1' => $milestones['coinsAtYear1'],
            ':coins_year_2' => $milestones['coinsAtYear2'],
            ':coins_total' => $milestones['finalCoins'],
            ':game_log' => json_encode($gameLog)
        ]);

        $runId = (int)$db->lastInsertId();

        echo json_encode([
            'success' => true,
            'message' => 'Run submitted successfully!',
            'runId' => $runId,
            'cheated' => $cheated,
            'cheatReason' => $cheatReason,
            'milestones' => $milestones
        ]);

    } catch (PDOException $e) {
        error_log("DATABASE ERROR: " . $e->getMessage());
        error_log("SQL State: " . $e->getCode());
        error_log("Stack trace: " . $e->getTraceAsString());
        echo json_encode([
            'success' => false,
            'message' => 'Failed to save run to database: ' . $e->getMessage()
        ]);
    }
}

function handleGetLeaderboard(): void {
    header('Content-Type: application/json');

    $category = $_GET['category'] ?? 'day_million';
    $mode = $_GET['mode'] ?? 'all';
    $limit = min((int)($_GET['limit'] ?? 100), 100);

    $data = queryLeaderboard($category, $mode, $limit);

    echo json_encode([
        'success' => true,
        'category' => $category,
        'mode' => $mode,
        'entries' => $data
    ]);
}

function queryLeaderboard(string $category, string $mode, int $limit = 100): array {
    // Valid categories
    $speedCategories = [
        'day_million', 'day_billion', 'day_trillion',
        'day_quadrillion', 'day_quintillion',
        'day_vanquish', 'day_surrender'
    ];
    $coinCategories = ['coins_year_1', 'coins_year_2', 'coins_total'];

    if (!in_array($category, array_merge($speedCategories, $coinCategories))) {
        return [];
    }

    try {
        $db = getDB();

        // Build WHERE clause
        $where = ["cheated = 0", "$category IS NOT NULL"];
        $params = [];

        if ($mode !== 'all') {
            $where[] = "game_mode = :mode";
            $params[':mode'] = $mode;
        }

        $whereClause = implode(' AND ', $where);

        // Speed categories: ORDER ASC (lower is better)
        // Coin categories: ORDER DESC (higher is better) - but stored as strings...
        if (in_array($category, $speedCategories)) {
            $orderBy = "$category ASC";
        } else {
            // For coin categories, we need to sort by the numeric value
            // Since they're stored as strings like "10^15" or "1234567", this is tricky
            // For now, sort by length DESC then value DESC (approximation)
            $orderBy = "LENGTH($category) DESC, $category DESC";
        }

        $sql = "
            SELECT id, player_name, game_mode, submitted_at,
                   day_million, day_billion, day_trillion,
                   day_quadrillion, day_quintillion,
                   day_vanquish, day_surrender,
                   coins_year_1, coins_year_2, coins_total
            FROM game_runs
            WHERE $whereClause
            ORDER BY $orderBy
            LIMIT $limit
        ";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll();

    } catch (PDOException $e) {
        error_log("Leaderboard query error: " . $e->getMessage());
        return [];
    }
}

function getLeaderboardCategories(): array {
    return [
        'speed' => [
            ['id' => 'day_million', 'name' => 'Fastest to 1 Million Coins'],
            ['id' => 'day_billion', 'name' => 'Fastest to 1 Billion Coins'],
            ['id' => 'day_trillion', 'name' => 'Fastest to 1 Trillion Coins'],
            ['id' => 'day_quadrillion', 'name' => 'Fastest to 1 Quadrillion Coins'],
            ['id' => 'day_quintillion', 'name' => 'Fastest to 1 Quintillion Coins'],
            ['id' => 'day_vanquish', 'name' => 'Fastest to Vanquish Enemy'],
            ['id' => 'day_surrender', 'name' => 'Fastest to Enemy Surrender'],
        ],
        'wealth' => [
            ['id' => 'coins_year_1', 'name' => 'Most Coins at Year 1'],
            ['id' => 'coins_year_2', 'name' => 'Most Coins at Year 2'],
            ['id' => 'coins_total', 'name' => 'Most Coins (Final)'],
        ]
    ];
}

function getGameModes(): array {
    return [
        ['id' => 'all', 'name' => 'All Modes'],
        ['id' => 'hard', 'name' => 'Hard Mode'],
        ['id' => 'ai_25cps', 'name' => 'AI 25 CPS'],
    ];
}

function renderHome(): void {
    include __DIR__ . '/../templates/layout.php';
}

function renderLeaderboards(): void {
    $category = $_GET['cat'] ?? 'day_million';
    $mode = $_GET['mode'] ?? 'all';

    $categories = getLeaderboardCategories();
    $modes = getGameModes();
    $entries = queryLeaderboard($category, $mode, 100);

    // Find category name
    $categoryName = $category;
    foreach (array_merge($categories['speed'], $categories['wealth']) as $cat) {
        if ($cat['id'] === $category) {
            $categoryName = $cat['name'];
            break;
        }
    }

    // Find mode name
    $modeName = 'All Modes';
    foreach ($modes as $m) {
        if ($m['id'] === $mode) {
            $modeName = $m['name'];
            break;
        }
    }

    // Determine if this is a speed or wealth category
    $isSpeed = in_array($category, ['day_million', 'day_billion', 'day_trillion',
        'day_quadrillion', 'day_quintillion', 'day_vanquish', 'day_surrender']);

    include __DIR__ . '/../templates/leaderboard.php';
}
