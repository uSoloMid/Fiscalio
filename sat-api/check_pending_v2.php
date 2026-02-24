<?php
$dbPath = 'C:\Fiscalio\Base_datos\database.sqlite';
try {
    $db = new PDO("sqlite:$dbPath");
    $stmt = $db->query("SELECT rfc, state, sat_status, package_count, attempts, updated_at FROM sat_requests WHERE state != 'completed' AND state != 'failed' ORDER BY created_at DESC LIMIT 20");
    echo "Pending SAT Requests (from local DB mirror):\n";
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo " - RFC: {$row['rfc']} | State: {$row['state']} | SAT Status: {$row['sat_status']} | Pkgs: {$row['package_count']} | Atmt: {$row['attempts']} | Last Opt: {$row['updated_at']}\n";
    }
}
catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
