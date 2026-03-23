<?php
/**
 * Route definitions
 */

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
    $mode = $input['mode'] ?? 'unknown';
    $day = $input['day'] ?? 0;
    $gameLog = $input['gameLog'] ?? null;

    if (empty($playerName)) {
        echo json_encode([
            'success' => false,
            'message' => 'Player name is required'
        ]);
        return;
    }

    // Log the submission for debugging (stub - actual storage in task 08)
    error_log("Leaderboard submission: $playerName ($mode) at day $day");

    echo json_encode([
        'success' => true,
        'message' => 'Run received! (validation pending)',
        'runId' => rand(1000, 9999), // Temporary stub ID
        'cheated' => false,
        'cheatReason' => null
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
