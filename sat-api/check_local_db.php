<?php
$dbPath = 'C:\Fiscalio\Base_datos\database.sqlite';
if (!file_exists($dbPath)) {
    echo "File not found: $dbPath\n";
    exit;
}
try {
    $db = new PDO("sqlite:$dbPath");
    $stmt = $db->query("SELECT COUNT(*) FROM agents");
    $count = $stmt->fetchColumn();
    echo "Total Agents in database.sqlite: $count\n";

    $stmt = $db->query("SELECT rfc, name FROM agents");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "- {$row['rfc']}: {$row['name']}\n";
    }
}
catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

$dbPathDev = 'C:\Fiscalio\Base_datos\database_dev.sqlite';
if (file_exists($dbPathDev)) {
    try {
        $dbDev = new PDO("sqlite:$dbPathDev");
        $stmt = $dbDev->query("SELECT COUNT(*) FROM agents");
        $countDev = $stmt->fetchColumn();
        echo "\nTotal Agents in database_dev.sqlite: $countDev\n";

        $stmt = $dbDev->query("SELECT rfc, name FROM agents");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            echo "- {$row['rfc']}: {$row['name']}\n";
        }
    }
    catch (Exception $e) {
        echo "Error: " . $e->getMessage() . "\n";
    }
}
