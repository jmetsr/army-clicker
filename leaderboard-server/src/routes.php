<?php
/**
 * Route definitions
 */

require_once __DIR__ . '/LogParser.php';

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

    // Log the submission for debugging
    error_log("Leaderboard submission: $playerName ({$milestones['gameMode']}) - day {$milestones['finalDay']}, coins: {$milestones['finalCoins']}");

    // TODO: Store in database (task 08)
    // TODO: Run validation (tasks 07b-f)

    echo json_encode([
        'success' => true,
        'message' => 'Run submitted successfully!',
        'runId' => rand(1000, 9999), // Temporary stub ID
        'cheated' => false,
        'cheatReason' => null,
        'milestones' => $milestones // Return milestones for debugging
    ]);
}

function handleGetLeaderboard(): void {
    header('Content-Type: application/json');

    // Stub - will be implemented in task 09
    echo json_encode([
        'leaderboard' => [],
        'message' => 'Leaderboard stub'
    ]);
}

function renderHome(): void {
    include __DIR__ . '/../templates/layout.php';
}

function renderLeaderboards(): void {
    // Stub - will be implemented in task 09
    echo '<h1>Leaderboards coming soon</h1>';
}
