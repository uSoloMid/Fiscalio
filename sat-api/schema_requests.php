<?php
$dbPath = 'C:\Fiscalio\Base_datos\database.sqlite';
try {
    $db = new PDO("sqlite:$dbPath");
    $stmt = $db->query("PRAGMA table_info(sat_requests)");
    echo "Columns in sat_requests:\n";
    while ($col = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "- {$col['name']}\n";
    }
}
catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
