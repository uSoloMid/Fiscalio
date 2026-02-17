<?php
$dbPath = 'C:\Fiscalio\Base_datos\database.sqlite';
try {
    $db = new PDO("sqlite:$dbPath");

    echo "Unique RFCs in businesses table:\n";
    $stmt = $db->query("SELECT rfc FROM businesses");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo " - {$row['rfc']}\n";
    }

    echo "\nSummary of RFCs in cfdis table:\n";
    $stmt = $db->query("SELECT rfc_receptor, COUNT(*) as total FROM cfdis GROUP BY rfc_receptor ORDER BY total DESC");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo " - Receptor: {$row['rfc_receptor']} | Count: {$row['total']}\n";
    }

    $stmt = $db->query("SELECT rfc_emisor, COUNT(*) as total FROM cfdis GROUP BY rfc_emisor ORDER BY total DESC LIMIT 10");
    echo "\nTop 10 Emisors in cfdis table:\n";
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo " - Emisor: {$row['rfc_emisor']} | Count: {$row['total']}\n";
    }


}
catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
