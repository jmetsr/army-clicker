<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($categoryName) ?> - Army Clicker Leaderboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'IBM Plex Mono', -apple-system, BlinkMacSystemFont, monospace;
            background: #0d0d1a;
            color: #e0e0e0;
            min-height: 100vh;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
        }
        header {
            text-align: center;
            padding: 30px 0;
            border-bottom: 1px solid #333;
            margin-bottom: 20px;
        }
        h1 {
            color: #ffd700;
            font-size: 2em;
            margin-bottom: 10px;
        }
        h1 a {
            color: #ffd700;
            text-decoration: none;
        }
        h1 a:hover {
            text-decoration: underline;
        }
        .subtitle {
            color: #888;
            font-size: 0.9em;
        }

        /* Navigation */
        .nav-section {
            margin-bottom: 20px;
        }
        .nav-section h3 {
            color: #888;
            font-size: 0.8em;
            margin-bottom: 8px;
            text-transform: uppercase;
        }
        .nav-tabs {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .nav-tab {
            padding: 8px 16px;
            background: #1a1a2e;
            border: 1px solid #333;
            border-radius: 4px;
            color: #aaa;
            text-decoration: none;
            font-size: 0.85em;
            transition: all 0.2s;
        }
        .nav-tab:hover {
            border-color: #ffd700;
            color: #ffd700;
        }
        .nav-tab.active {
            background: #ffd700;
            color: #000;
            border-color: #ffd700;
            font-weight: 600;
        }

        /* Category groups */
        .category-group {
            margin-bottom: 15px;
        }
        .category-group-title {
            color: #666;
            font-size: 0.75em;
            margin-bottom: 5px;
        }

        /* Leaderboard table */
        .current-board {
            margin: 30px 0;
            padding: 20px;
            background: #1a1a2e;
            border-radius: 8px;
            border: 1px solid #333;
        }
        .current-board h2 {
            color: #ffd700;
            margin-bottom: 5px;
        }
        .current-board .mode-badge {
            display: inline-block;
            padding: 3px 10px;
            background: #333;
            border-radius: 3px;
            font-size: 0.8em;
            color: #aaa;
            margin-bottom: 15px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #2a2a3e;
        }
        th {
            color: #888;
            font-weight: 600;
            font-size: 0.8em;
            text-transform: uppercase;
        }
        tr:hover {
            background: #22223a;
        }
        .rank {
            color: #ffd700;
            font-weight: 600;
            width: 50px;
        }
        .rank-1 { color: #ffd700; }
        .rank-2 { color: #c0c0c0; }
        .rank-3 { color: #cd7f32; }
        .player-name {
            font-weight: 500;
        }
        .score {
            color: #4da6ff;
            font-weight: 600;
        }
        .mode {
            color: #888;
            font-size: 0.85em;
        }
        .date {
            color: #666;
            font-size: 0.85em;
        }

        .empty-message {
            text-align: center;
            padding: 40px;
            color: #666;
        }

        /* Footer */
        footer {
            text-align: center;
            padding: 30px;
            color: #555;
            font-size: 0.85em;
            border-top: 1px solid #333;
            margin-top: 30px;
        }
        footer a {
            color: #4da6ff;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1><a href="/leaderboards">Army Clicker Leaderboard</a></h1>
            <div class="subtitle">Compete for glory across multiple categories</div>
        </header>

        <!-- Mode selector -->
        <div class="nav-section">
            <h3>Game Mode</h3>
            <div class="nav-tabs">
                <?php foreach ($modes as $m): ?>
                    <a href="?cat=<?= urlencode($category) ?>&mode=<?= urlencode($m['id']) ?>"
                       class="nav-tab <?= $mode === $m['id'] ? 'active' : '' ?>">
                        <?= htmlspecialchars($m['name']) ?>
                    </a>
                <?php endforeach; ?>
            </div>
        </div>

        <!-- Category selector -->
        <div class="nav-section">
            <h3>Speed Records</h3>
            <div class="nav-tabs">
                <?php foreach ($categories['speed'] as $cat): ?>
                    <a href="?cat=<?= urlencode($cat['id']) ?>&mode=<?= urlencode($mode) ?>"
                       class="nav-tab <?= $category === $cat['id'] ? 'active' : '' ?>">
                        <?= htmlspecialchars($cat['name']) ?>
                    </a>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="nav-section">
            <h3>Wealth Records</h3>
            <div class="nav-tabs">
                <?php foreach ($categories['wealth'] as $cat): ?>
                    <a href="?cat=<?= urlencode($cat['id']) ?>&mode=<?= urlencode($mode) ?>"
                       class="nav-tab <?= $category === $cat['id'] ? 'active' : '' ?>">
                        <?= htmlspecialchars($cat['name']) ?>
                    </a>
                <?php endforeach; ?>
            </div>
        </div>

        <!-- Current leaderboard -->
        <div class="current-board">
            <h2><?= htmlspecialchars($categoryName) ?></h2>
            <span class="mode-badge"><?= htmlspecialchars($modeName) ?></span>

            <?php if (empty($entries)): ?>
                <div class="empty-message">
                    No entries yet. Be the first to submit a run!
                </div>
            <?php else: ?>
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Player</th>
                            <th><?= $isSpeed ? 'Day' : 'Coins' ?></th>
                            <?php if ($mode === 'all'): ?>
                                <th>Mode</th>
                            <?php endif; ?>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($entries as $i => $entry): ?>
                            <?php
                                $rank = $i + 1;
                                $rankClass = $rank <= 3 ? "rank-$rank" : "";
                                $score = $entry[$category] ?? '-';
                                $modeDisplay = str_replace('_', ' ', $entry['game_mode']);
                                $date = date('M j, Y', strtotime($entry['submitted_at']));
                            ?>
                            <tr>
                                <td class="rank <?= $rankClass ?>">#<?= $rank ?></td>
                                <td class="player-name"><?= htmlspecialchars($entry['player_name']) ?></td>
                                <td class="score"><?= $isSpeed ? "Day $score" : htmlspecialchars($score) ?></td>
                                <?php if ($mode === 'all'): ?>
                                    <td class="mode"><?= htmlspecialchars($modeDisplay) ?></td>
                                <?php endif; ?>
                                <td class="date"><?= $date ?></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>

        <footer>
            <a href="/">Home</a> |
            <a href="/leaderboards">Leaderboards</a>
            <br><br>
            Army Clicker Leaderboard Server
        </footer>
    </div>
</body>
</html>
