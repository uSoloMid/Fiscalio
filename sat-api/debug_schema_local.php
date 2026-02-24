<?php
$db = new PDO('sqlite:C:/Fiscalio/Base_datos/database.sqlite');
echo "Columns in packages:\n";
$s = $db->query('PRAGMA table_info(packages)');
while ($r = $s->fetch(PDO::FETCH_ASSOC))
    echo $r['name'] . "\n";
echo "\nColumns in sat_requests:\n";
$s = $db->query('PRAGMA table_info(sat_requests)');
while ($r = $s->fetch(PDO::FETCH_ASSOC))
    echo $r['name'] . "\n";
