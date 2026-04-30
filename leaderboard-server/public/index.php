<?php
/**
 * Army Clicker Leaderboard - Entry Point
 */

// CORS headers for game to POST here
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../src/config.php';
require_once __DIR__ . '/../src/db.php';
require_once __DIR__ . '/../src/routes.php';

// URL prefix templates use for internal links. Empty in dev (mounted at /),
// set to '/leaderboard' in production.
if (!defined('LB_BASE')) define('LB_BASE', '');

// Simple router
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Remove trailing slash
$uri = rtrim($uri, '/') ?: '/';

// Route the request
route($method, $uri);
