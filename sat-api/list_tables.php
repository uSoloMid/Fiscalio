<?php
$dbPath = 'C:\Fiscalio\Base_datos\database.sqlite';
try {
    $db = new PDO("sqlite:$dbPath");
    $stmt = $db->query("SELECT name FROM sqlite_master WHERE type='table'");
    echo "Tables in database.sqlite:\n";
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "- {$row['name']}\n";
    }
}
catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
