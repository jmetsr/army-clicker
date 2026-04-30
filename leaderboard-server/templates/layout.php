<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Army Clicker Leaderboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'IBM Plex Mono', -apple-system, BlinkMacSystemFont, monospace;
            background: #0d0d1a;
            color: #e0e0e0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            padding: 40px;
        }
        h1 {
            color: #ffd700;
            font-size: 2.5em;
            margin-bottom: 15px;
        }
        .subtitle {
            color: #888;
            margin-bottom: 30px;
        }
        .btn {
            display: inline-block;
            padding: 15px 40px;
            background: #ffd700;
            color: #000;
            text-decoration: none;
            font-weight: 600;
            border-radius: 5px;
            transition: all 0.2s;
        }
        .btn:hover {
            background: #ffed4a;
            transform: translateY(-2px);
        }
        .api-info {
            margin-top: 40px;
            color: #555;
            font-size: 0.85em;
        }
        .api-info code {
            background: #1a1a2e;
            padding: 2px 8px;
            border-radius: 3px;
            color: #4da6ff;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Army Clicker Leaderboard</h1>
        <p class="subtitle">Track your progress. Compete for glory.</p>
        <a href="<?= LB_BASE ?>/leaderboards" class="btn">View Leaderboards</a>
        <div class="api-info">
            API: <code>POST <?= LB_BASE ?>/api/submit-run</code> | <code>GET <?= LB_BASE ?>/api/leaderboard</code>
        </div>
    </div>
</body>
</html>
