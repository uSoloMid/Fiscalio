<?php
$dbPath = 'C:\Fiscalio\Base_datos\database.sqlite';
try {
    $db = new PDO("sqlite:$dbPath");
    $stmt = $db->query("SELECT rfc, legal_name, common_name FROM businesses");
    echo "Businesses in database.sqlite:\n";
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo " - {$row['rfc']}: {$row['legal_name']} ({$row['common_name']})\n";
    }
}
catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
