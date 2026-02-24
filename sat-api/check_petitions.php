<?php
$dbPath = 'C:\Fiscalio\Base_datos\database.sqlite';
try {
    $db = new PDO("sqlite:$dbPath");
    $stmt = $db->query("SELECT * FROM petitions WHERE status != 'completed' AND status != 'failed' LIMIT 20");
    echo "Pending Petitions (from local DB mirror):\n";
    if ($stmt) {
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            echo " - ID: {$row['id']} | Business: {$row['business_id']} | Status: {$row['status']} | Updated: {$row['updated_at']}\n";
        }
    }
    else {
        echo "Table petitions might be different.\n";
    }
}
catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
