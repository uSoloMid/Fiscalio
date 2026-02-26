<?php
$db = new PDO('sqlite:Base_datos/database.sqlite');
$stmt = $db->query("SELECT rfc, type, start_date, end_date, state, created_at FROM sat_requests ORDER BY created_at DESC LIMIT 5");
$results = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo str_pad("RFC", 15) . " | " . str_pad("Type", 10) . " | " . str_pad("Start", 20) . " | " . str_pad("End", 20) . " | " . str_pad("State", 10) . " | " . "Created At\n";
echo str_repeat("-", 100) . "\n";
foreach ($results as $row) {
    echo str_pad($row['rfc'], 15) . " | " . str_pad($row['type'], 10) . " | " . str_pad($row['start_date'], 20) . " | " . str_pad($row['end_date'], 20) . " | " . str_pad($row['state'], 10) . " | " . $row['created_at'] . "\n";
}
