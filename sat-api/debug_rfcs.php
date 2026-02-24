<?php
$dbPath = 'C:\Fiscalio\Base_datos\database.sqlite';
try {
    $db = new PDO("sqlite:$dbPath");

    echo "Unique RFCs in businesses table:\n";
    $stmt = $db->query("SELECT rfc FROM businesses");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo " - {$row['rfc']}\n";
    }

    echo "\nUnique RFCs (receptor) in cfdis table:\n";
    $stmt = $db->query("SELECT DISTINCT receptor_rfc FROM cfdis");
    $count = 0;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo " - {$row['receptor_rfc']}\n";
        $count++;
    }
    echo "Total unique receptor RFCs: $count\n";

    echo "\nUnique RFCs (emisor) in cfdis table:\n";
    $stmt = $db->query("SELECT DISTINCT emisor_rfc FROM cfdis");
    $count = 0;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // echo " - {$row['emisor_rfc']}\n";
        $count++;
    }
    echo "Total unique emisor RFCs: $count\n";


}
catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
