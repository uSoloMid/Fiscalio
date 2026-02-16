<?php
$db = new PDO('sqlite:Base_datos/database.sqlite');
$stmt = $db->query("SELECT rfc, is_syncing, sync_status, last_sync_at FROM businesses");
$results = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo str_pad("RFC", 15) . " | " . str_pad("Syncing", 8) . " | " . str_pad("Status", 10) . " | " . "Last Sync At\n";
echo str_repeat("-", 60) . "\n";
foreach ($results as $row) {
    echo str_pad($row['rfc'], 15) . " | " . str_pad($row['is_syncing'], 8) . " | " . str_pad($row['sync_status'], 10) . " | " . $row['last_sync_at'] . "\n";
}
