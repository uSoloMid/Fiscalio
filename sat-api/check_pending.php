<?php
$dbPath = 'C:\Fiscalio\Base_datos\database.sqlite';
try {
    $db = new PDO("sqlite:$dbPath");
    // Check sat_requests status
    $stmt = $db->query("SELECT rfc, package_count, last_check_at FROM sat_requests WHERE status != 'completed' LIMIT 10");
    echo "Pending SAT Requests (from local DB mirror):\n";
    if ($stmt) {
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            echo " - RFC: {$row['rfc']} | Packages: {$row['package_count']} | Last Check: {$row['last_check_at']}\n";
        }
    }
    else {
        echo "Table sat_requests might not have a status column or it's different.\n";
        // Check columns again
        $stmt = $db->query("PRAGMA table_info(sat_requests)");
        while ($col = $stmt->fetch(PDO::FETCH_ASSOC)) {
            echo "  Column: {$col['name']}\n";
        }
    }
}
catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
