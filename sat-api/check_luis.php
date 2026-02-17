<?php
$db = new PDO('sqlite:C:/Fiscalio/Base_datos/database_dev.sqlite');
$rfc = 'ROBL8205181B2';

echo "Requests for $rfc:\n";
$s = $db->prepare('SELECT COUNT(*) FROM sat_requests WHERE rfc = ?');
$s->execute([$rfc]);
echo "Count: " . $s->fetchColumn() . "\n";

echo "Requests for $rfc:\n";
$s = $db->prepare('SELECT id, type, state, xml_count, package_count FROM sat_requests WHERE rfc = ?');
$s->execute([$rfc]);
while ($row = $s->fetch(PDO::FETCH_ASSOC)) {
    echo "ID: {$row['id']} | Type: {$row['type']} | State: {$row['state']} | XMLs: {$row['xml_count']} | Pkgs: {$row['package_count']}\n";
}

echo "Total CFDI for $rfc: ";
$s = $db->prepare('SELECT COUNT(*) FROM cfdis WHERE rfc_emisor = ? OR rfc_receptor = ?');
$s->execute([$rfc, $rfc]);
echo $s->fetchColumn() . "\n";
