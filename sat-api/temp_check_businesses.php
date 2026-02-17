<?php
$dbPath = 'C:\Fiscalio\Base_datos\database.sqlite';
try {
    $db = new PDO("sqlite:$dbPath");
    $stmt = $db->query("SELECT * FROM businesses");
    echo "Summary of businesses in database.sqlite:\n";
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "- RFC: {$row['rfc']} | Legal Name: {$row['legal_name']}\n";
    }
}
catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
