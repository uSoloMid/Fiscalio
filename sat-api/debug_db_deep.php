<?php
$dbPath = 'C:\Fiscalio\Base_datos\database.sqlite';
try {
    $db = new PDO("sqlite:$dbPath");

    $stmt = $db->query("SELECT COUNT(*) FROM businesses");
    echo "Businesses: " . $stmt->fetchColumn() . "\n";

    $stmt = $db->query("SELECT COUNT(*) FROM sat_requests");
    echo "SAT Requests: " . $stmt->fetchColumn() . "\n";

    $stmt = $db->query("SELECT COUNT(*) FROM cfdis");
    echo "CFDIs: " . $stmt->fetchColumn() . "\n";

    echo "\nLast 5 SAT Requests:\n";
    $stmt = $db->query("SELECT rfc, status, created_at FROM sat_requests ORDER BY created_at DESC LIMIT 5");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo " - {$row['rfc']} | {$row['status']} | {$row['created_at']}\n";
    }


}
catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
