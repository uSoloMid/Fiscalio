<?php
$dbs = ['database.sqlite', 'database_dev.sqlite'];
foreach ($dbs as $dbFile) {
    $path = "C:/Fiscalio/Base_datos/$dbFile";
    if (!file_exists($path)) {
        echo "$dbFile not found at $path\n";
        continue;
    }
    try {
        $db = new PDO("sqlite:$path");
        echo "=== $dbFile ===\n";
        $stmt = $db->query("SELECT rfc, legal_name FROM businesses");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            echo "RFC: {$row['rfc']} | Name: {$row['legal_name']}\n";
        }
    }
    catch (Exception $e) {
        echo "Error in $dbFile: " . $e->getMessage() . "\n";
    }
    echo "\n";
}
