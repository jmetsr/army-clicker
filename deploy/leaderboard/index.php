<?php
/**
 * Leaderboard front controller (production).
 * Lives at public_html/leaderboard/index.php.
 * PHP source + config live at ~/leaderboard-app/ (outside web root).
 */

$APP_ROOT = dirname(__DIR__, 2) . '/leaderboard-app';

require_once "$APP_ROOT/src/config.php";

header('Access-Control-Allow-Origin: ' . GAME_ORIGIN);
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once "$APP_ROOT/src/db.php";
require_once "$APP_ROOT/src/routes.php";

define('LB_BASE', '/leaderboard');

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Strip /leaderboard prefix so routes.php sees the same URIs as in dev
if (strpos($uri, '/leaderboard') === 0) {
    $uri = substr($uri, strlen('/leaderboard'));
}
$uri = rtrim($uri, '/') ?: '/';

route($_SERVER['REQUEST_METHOD'], $uri);
