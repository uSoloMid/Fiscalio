import sys

path = r'c:\Fiscalio\sat-api\app\Http\Controllers\ProvisionalControlController.php'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

target1 = '''            // Ingresos Considerados
            $req = new Request(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => 'ingresos_total']);
            $details['ingresos_considerados'] = collect($this->getBucketDetails($req)->original);

            // Egresos Considerados
            $req = new Request(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => 'egresos_total']);
            $details['egresos_considerados'] = collect($this->getBucketDetails($req)->original);'''
target1 = target1.replace('\r\n', '\n')

replace1 = '''            // Ingresos Considerados (PUE + REP)
            $details['ingresos_considerados'] = collect();
            foreach(['ingresos_total_pue', 'ingresos_total_rep'] as $b) {
                $req = new Request(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => $b]);
                $items = collect($this->getBucketDetails($req)->original);
                $details['ingresos_considerados'] = $details['ingresos_considerados']->concat($items);
            }

            // Egresos Considerados (PUE + REP)
            $details['egresos_considerados'] = collect();
            foreach(['egresos_total_pue', 'egresos_total_rep'] as $b) {
                $req = new Request(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => $b]);
                $items = collect($this->getBucketDetails($req)->original);
                $details['egresos_considerados'] = $details['egresos_considerados']->concat($items);
            }'''

target2 = '''            foreach(['egresos_total_pue', 'egresos_total_rep'] as $b) {
                $req = new Request(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => $b]);
                $items = collect($this->getBucketDetails($req)->original);
                $details['egresos'] = $details['egresos']->concat($items);
            }'''
target2 = target2.replace('\r\n', '\n')

code_unix = code.replace('\r\n', '\n')
if target1 in code_unix:
    code_unix = code_unix.replace(target1, replace1)
    print("Replaced target1")
else:
    print("Target1 missing")

if target2 in code_unix:
    code_unix = code_unix.replace(target2, '')
    print("Replaced target2")
else:
    print("Target2 missing")

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(code_unix)
