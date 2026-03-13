# Usuarios & Multi-Tenancy (Opción A: por Despacho) — Plan de Implementación

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar sistema completo de usuarios con roles (admin / contador), aislamiento por workspace, gestión de clientes por usuario y registro público para nuevos despachos.

**Architecture:** Un Workspace = un despacho contable. El `owner` (is_admin=true) ve todos sus clientes y puede crear cuentas de contador. Un contador solo ve los clientes asignados a él via tabla `business_user`. Registro público crea un workspace + usuario admin en una sola llamada.

**Tech Stack:** Laravel 10 + Sanctum + MySQL + React 19 + TypeScript + Tailwind

---

## Estado actual (no tocar sin leer esto)

- `users.is_admin` (bool) existe pero **nunca se valida en rutas**
- `users.current_workspace_id` existe y se usa en login response
- `businesses.workspace_id` existe y está populado
- `business_user` (pivote) existe pero **nunca se usa para filtrar**
- `ClientController::index()` devuelve **todos** los businesses sin filtro
- `ClientController::store()` **no asigna** `workspace_id` al crear
- No existe `UserController`, ni rutas `/api/users`, ni `/api/register`
- Frontend no tiene página de gestión de usuarios ni registro

## Modelo de acceso

```
Admin (is_admin=true):
  - Ve todos los businesses de su workspace
  - Puede crear/editar/eliminar usuarios de su workspace
  - Puede asignar clientes a contadores

Contador (is_admin=false):
  - Ve solo businesses en business_user donde user_id = su id
  - No puede crear usuarios
  - No puede ver la sección de gestión de usuarios
```

---

## Task 1: Middleware IsAdmin

**Files:**
- Create: `sat-api/app/Http/Middleware/IsAdmin.php`
- Modify: `sat-api/app/Http/Kernel.php` (registrar alias)

**Step 1: Crear el middleware**

```php
<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class IsAdmin
{
    public function handle(Request $request, Closure $next)
    {
        if (!$request->user() || !$request->user()->is_admin) {
            return response()->json(['message' => 'No autorizado.'], 403);
        }
        return $next($request);
    }
}
```

**Step 2: Registrar alias en Kernel.php**

En `$middlewareAliases` (o `$routeMiddleware` según versión Laravel):
```php
'is_admin' => \App\Http\Middleware\IsAdmin::class,
```

**Step 3: Commit**
```bash
git add sat-api/app/Http/Middleware/IsAdmin.php sat-api/app/Http/Kernel.php
git commit -m "feat: middleware IsAdmin para rutas de administración"
```

---

## Task 2: Scope de acceso en Business (helper en User)

**Files:**
- Modify: `sat-api/app/Models/User.php`

**Goal:** Método `accessibleBusinessQuery()` que devuelve el query base de businesses filtrado según el rol del usuario.

**Step 1: Agregar método al modelo User**

```php
/**
 * Query base de businesses accesibles para este usuario.
 * Admin: todos los del workspace. Contador: solo los asignados.
 */
public function accessibleBusinessQuery()
{
    $query = \App\Models\Business::where('workspace_id', $this->current_workspace_id);

    if (!$this->is_admin) {
        $assignedIds = $this->businesses()->pluck('businesses.id');
        $query->whereIn('id', $assignedIds);
    }

    return $query;
}
```

**Step 2: Commit**
```bash
git add sat-api/app/Models/User.php
git commit -m "feat: User::accessibleBusinessQuery() — scope por workspace y rol"
```

---

## Task 3: Filtrar ClientController por workspace y usuario

**Files:**
- Modify: `sat-api/app/Http/Controllers/ClientController.php`

**Step 1: Reemplazar `Business::with(...)` por `accessibleBusinessQuery()` en `index()`**

En el método `index()`, cambiar la primera línea de `$query`:
```php
// ANTES:
$query = Business::with(['group', 'tags'])->withCount('petitions');

// DESPUÉS:
$query = $request->user()->accessibleBusinessQuery()
    ->with(['group', 'tags'])->withCount('petitions');
```

**Step 2: Asignar `workspace_id` al crear cliente en `store()`**

En `store()`, en el array de `updateOrCreate`, agregar:
```php
'workspace_id' => $request->user()->current_workspace_id,
```

**Step 3: Proteger `destroy()`, `updateClient()`, `updateFiel()`, `updateGroup()`, `updateTags()`**

En cada método que usa `Business::findOrFail($id)`, validar pertenencia:
```php
$business = $request->user()->accessibleBusinessQuery()->findOrFail($id);
```
(Esto reemplaza `Business::findOrFail($id)` en todos esos métodos.)

Nota: los métodos `destroy`, `updateGroup`, `updateTags`, `updateClient`, `updateFiel` necesitan recibir `Request $request` si no lo tienen ya.

**Step 4: Commit**
```bash
git add sat-api/app/Http/Controllers/ClientController.php
git commit -m "feat: ClientController — filtrar por workspace y rol de usuario"
```

---

## Task 4: UserController — CRUD de contadores

**Files:**
- Create: `sat-api/app/Http/Controllers/UserController.php`
- Modify: `sat-api/routes/api.php`

**Step 1: Crear UserController**

```php
<?php
namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    /** Lista usuarios del mismo workspace. */
    public function index(Request $request)
    {
        $users = User::where('current_workspace_id', $request->user()->current_workspace_id)
            ->with('businesses:id,rfc,common_name,legal_name')
            ->get()
            ->map(fn($u) => [
                'id'         => $u->id,
                'name'       => $u->name,
                'email'      => $u->email,
                'is_admin'   => $u->is_admin,
                'businesses' => $u->businesses,
            ]);

        return response()->json($users);
    }

    /** Crear contador en el mismo workspace. */
    public function store(Request $request)
    {
        $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
        ]);

        $user = User::create([
            'name'                 => $request->name,
            'email'                => $request->email,
            'password'             => Hash::make($request->password),
            'is_admin'             => false,
            'current_workspace_id' => $request->user()->current_workspace_id,
        ]);

        return response()->json($user, 201);
    }

    /** Actualizar nombre / email / contraseña de un contador. */
    public function update(Request $request, $id)
    {
        $user = User::where('id', $id)
            ->where('current_workspace_id', $request->user()->current_workspace_id)
            ->firstOrFail();

        $request->validate([
            'name'     => 'sometimes|string|max:255',
            'email'    => "sometimes|email|unique:users,email,{$id}",
            'password' => 'sometimes|string|min:6',
        ]);

        $data = $request->only(['name', 'email']);
        if ($request->filled('password')) {
            $data['password'] = Hash::make($request->password);
        }

        $user->update($data);
        return response()->json($user);
    }

    /** Eliminar contador (no puede eliminarse a sí mismo). */
    public function destroy(Request $request, $id)
    {
        if ($request->user()->id == $id) {
            return response()->json(['message' => 'No puedes eliminarte a ti mismo.'], 422);
        }

        $user = User::where('id', $id)
            ->where('current_workspace_id', $request->user()->current_workspace_id)
            ->firstOrFail();

        $user->delete();
        return response()->json(['success' => true]);
    }

    /** Sincronizar clientes asignados a un contador. */
    public function syncBusinesses(Request $request, $id)
    {
        $request->validate([
            'business_ids'   => 'required|array',
            'business_ids.*' => 'integer|exists:businesses,id',
        ]);

        $contador = User::where('id', $id)
            ->where('current_workspace_id', $request->user()->current_workspace_id)
            ->firstOrFail();

        // Solo puede asignar businesses del propio workspace
        $validIds = \App\Models\Business::where('workspace_id', $request->user()->current_workspace_id)
            ->whereIn('id', $request->business_ids)
            ->pluck('id');

        $contador->businesses()->sync($validIds);

        return response()->json(['success' => true, 'assigned' => $validIds]);
    }
}
```

**Step 2: Agregar rutas en api.php**

Dentro del grupo `auth:sanctum`, al final:
```php
// User management (solo admin)
Route::middleware('is_admin')->group(function () {
    Route::get('/users', [\App\Http\Controllers\UserController::class, 'index']);
    Route::post('/users', [\App\Http\Controllers\UserController::class, 'store']);
    Route::put('/users/{id}', [\App\Http\Controllers\UserController::class, 'update']);
    Route::delete('/users/{id}', [\App\Http\Controllers\UserController::class, 'destroy']);
    Route::put('/users/{id}/businesses', [\App\Http\Controllers\UserController::class, 'syncBusinesses']);
});
```

**Step 3: Commit**
```bash
git add sat-api/app/Http/Controllers/UserController.php sat-api/routes/api.php
git commit -m "feat: UserController — CRUD contadores + asignación de clientes"
```

---

## Task 5: Endpoint de registro público

**Files:**
- Modify: `sat-api/app/Http/Controllers/AuthController.php`
- Modify: `sat-api/routes/api.php`

**Goal:** `POST /api/register` crea un workspace + usuario admin. Es pública (sin auth).

**Step 1: Agregar método `register` en AuthController**

```php
public function register(Request $request)
{
    $request->validate([
        'name'           => 'required|string|max:255',
        'email'          => 'required|email|unique:users,email',
        'password'       => 'required|string|min:8|confirmed',
        'workspace_name' => 'required|string|max:255',
    ]);

    $workspace = \App\Models\Workspace::create([
        'name'     => $request->workspace_name,
        'owner_id' => 0, // temporal, se actualiza tras crear user
    ]);

    $user = \App\Models\User::create([
        'name'                 => $request->name,
        'email'                => $request->email,
        'password'             => \Illuminate\Support\Facades\Hash::make($request->password),
        'is_admin'             => true,
        'current_workspace_id' => $workspace->id,
    ]);

    $workspace->update(['owner_id' => $user->id]);

    return response()->json([
        'user'  => $user->load('currentWorkspace'),
        'token' => $user->createToken('auth_token')->plainTextToken,
    ], 201);
}
```

**Step 2: Agregar ruta pública en api.php** (antes del grupo `auth:sanctum`):
```php
Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:10,1');
```

**Step 3: Commit**
```bash
git add sat-api/app/Http/Controllers/AuthController.php sat-api/routes/api.php
git commit -m "feat: POST /api/register — crea workspace + admin en un paso"
```

---

## Task 6: Devolver is_admin y workspace en login/user

**Files:**
- Modify: `sat-api/app/Http/Controllers/AuthController.php`

**Goal:** El frontend necesita saber si el usuario es admin para mostrar/ocultar UI.

**Step 1: Actualizar respuesta de `login()`**

```php
// En login(), cambiar el return:
return response()->json([
    'user'  => $user->load('currentWorkspace'),
    'token' => $user->createToken('auth_token')->plainTextToken,
]);
```
(Ya devuelve `user`, solo asegurarse de que incluye `is_admin` — está en `$fillable` y no en `$hidden`, así que ya se serializa. Verificar que `currentWorkspace` carga bien.)

**Step 2: Commit**
```bash
git add sat-api/app/Http/Controllers/AuthController.php
git commit -m "fix: login devuelve currentWorkspace cargado"
```

---

## Task 7: Frontend — servicios API para usuarios

**Files:**
- Modify: `ui/src/services.ts`

**Step 1: Agregar funciones de usuarios al final de services.ts**

```typescript
// ── User management ──────────────────────────────────
export async function listUsers() {
  const res = await apiFetch('/api/users');
  return res.json();
}

export async function createUser(data: { name: string; email: string; password: string }) {
  const res = await apiFetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).message || 'Error al crear usuario');
  return res.json();
}

export async function updateUser(id: number, data: { name?: string; email?: string; password?: string }) {
  const res = await apiFetch(`/api/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).message || 'Error al actualizar usuario');
  return res.json();
}

export async function deleteUser(id: number) {
  const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Error al eliminar usuario');
  return res.json();
}

export async function syncUserBusinesses(userId: number, businessIds: number[]) {
  const res = await apiFetch(`/api/users/${userId}/businesses`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_ids: businessIds }),
  });
  if (!res.ok) throw new Error('Error al asignar clientes');
  return res.json();
}

export async function registerWorkspace(data: {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  workspace_name: string;
}) {
  const res = await apiFetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).message || 'Error al registrarse');
  return res.json();
}
```

**Step 2: Asegurarse que `apiFetch` existe o usar el patrón correcto**

Revisar cómo se hace fetch en services.ts. Si usa `apiRequest` u otro helper, adaptar la firma.

**Step 3: Commit**
```bash
git add ui/src/services.ts
git commit -m "feat: funciones API de usuarios y registro en services.ts"
```

---

## Task 8: Frontend — guardar is_admin en App.tsx

**Files:**
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/services.ts` (función `getCurrentUser`)

**Goal:** App sabe si el usuario logueado es admin para mostrar el menú de gestión de usuarios.

**Step 1: Agregar función `getCurrentUser` en services.ts**

```typescript
export async function getCurrentUser() {
  const res = await apiFetch('/api/user');
  if (!res.ok) return null;
  return res.json(); // { id, name, email, is_admin, currentWorkspace, ... }
}
```

**Step 2: Agregar estado `currentUser` en App.tsx**

```typescript
const [currentUser, setCurrentUser] = useState<{ id: number; name: string; is_admin: boolean } | null>(null);
const [showUsers, setShowUsers] = useState(false);

// En handleLoginSuccess, cargar el usuario:
const handleLoginSuccess = async () => {
  setIsAuthenticated(true);
  const user = await getCurrentUser();
  setCurrentUser(user);
};

// Al montar si ya está autenticado:
useEffect(() => {
  if (isAuthenticated) {
    getCurrentUser().then(setCurrentUser);
  }
}, []);
```

**Step 3: Pasar `currentUser` a DashboardPage y manejar vista `showUsers`**

```tsx
// En el render, agregar antes del return de DashboardPage:
} : showUsers ? (
  <UsersPage onBack={() => setShowUsers(false)} />
) : (
  <DashboardPage
    ...
    isAdmin={currentUser?.is_admin ?? false}
    onViewUsers={() => setShowUsers(true)}
  />
)
```

**Step 4: Commit**
```bash
git add ui/src/App.tsx ui/src/services.ts
git commit -m "feat: App.tsx carga currentUser y maneja vista UsersPage"
```

---

## Task 9: Frontend — UsersPage

**Files:**
- Create: `ui/src/pages/UsersPage.tsx`

**Goal:** Página completa de gestión de usuarios. Solo visible para admins.

**Funcionalidades:**
- Lista de contadores del workspace (nombre, email, clientes asignados)
- Botón "Nuevo contador" → modal con nombre, email, contraseña
- Botón "Asignar clientes" → checklist de businesses del workspace
- Botón "Eliminar" con confirmación

**Step 1: Crear UsersPage.tsx**

```tsx
import { useState, useEffect } from 'react';
import { listUsers, createUser, deleteUser, syncUserBusinesses, listClients } from '../services';

interface UserRow {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
  businesses: { id: number; rfc: string; common_name: string }[];
}

interface Props {
  onBack: () => void;
}

export function UsersPage({ onBack }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [allBusinesses, setAllBusinesses] = useState<{ id: number; rfc: string; common_name: string; legal_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal crear usuario
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal asignar clientes
  const [assignUser, setAssignUser] = useState<UserRow | null>(null);
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<number[]>([]);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [usersData, businessesData] = await Promise.all([
      listUsers(),
      listClients({ pageSize: 200 }),
    ]);
    setUsers(usersData);
    setAllBusinesses(businessesData.data ?? businessesData);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await createUser(form);
      setShowCreate(false);
      setForm({ name: '', email: '', password: '' });
      loadAll();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user: UserRow) {
    if (!confirm(`¿Eliminar a ${user.name}?`)) return;
    await deleteUser(user.id);
    loadAll();
  }

  function openAssign(user: UserRow) {
    setAssignUser(user);
    setSelectedBusinessIds(user.businesses.map(b => b.id));
  }

  async function handleSyncBusinesses() {
    if (!assignUser) return;
    await syncUserBusinesses(assignUser.id, selectedBusinessIds);
    setAssignUser(null);
    loadAll();
  }

  function toggleBusiness(id: number) {
    setSelectedBusinessIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-800">
            ← Volver
          </button>
          <h1 className="text-xl font-bold text-gray-900">Gestión de Usuarios</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-[#0C6B4B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#0a573b]"
        >
          + Nuevo contador
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Correo</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Clientes asignados</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      {user.is_admin ? (
                        <span className="bg-[#0C6B4B]/10 text-[#0C6B4B] text-xs font-semibold px-2 py-1 rounded-full">Admin</span>
                      ) : (
                        <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-1 rounded-full">Contador</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {user.is_admin ? (
                        <span className="text-gray-400 italic">Todos</span>
                      ) : (
                        <span>{user.businesses.length} cliente{user.businesses.length !== 1 ? 's' : ''}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {!user.is_admin && (
                        <button
                          onClick={() => openAssign(user)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Asignar clientes
                        </button>
                      )}
                      {!user.is_admin && (
                        <button
                          onClick={() => handleDelete(user)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear usuario */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Nuevo Contador</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  type="text" required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-[#0C6B4B] focus:border-[#0C6B4B] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo</label>
                <input
                  type="email" required value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-[#0C6B4B] focus:border-[#0C6B4B] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input
                  type="password" required minLength={6} value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-[#0C6B4B] focus:border-[#0C6B4B] outline-none"
                />
              </div>
              {formError && <p className="text-red-500 text-sm">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 text-sm bg-[#0C6B4B] text-white rounded-lg hover:bg-[#0a573b] disabled:opacity-50">
                  {saving ? 'Creando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal asignar clientes */}
      {assignUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
            <h2 className="text-lg font-bold mb-1">Asignar clientes a {assignUser.name}</h2>
            <p className="text-sm text-gray-500 mb-4">Selecciona los RFCs que este contador puede ver</p>
            <div className="overflow-y-auto flex-1 space-y-1 border rounded-lg p-3">
              {allBusinesses.map(b => (
                <label key={b.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBusinessIds.includes(b.id)}
                    onChange={() => toggleBusiness(b.id)}
                    className="accent-[#0C6B4B]"
                  />
                  <span className="text-sm">
                    <span className="font-medium">{b.rfc}</span>
                    <span className="text-gray-500 ml-2">{b.common_name || b.legal_name}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAssignUser(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
              <button onClick={handleSyncBusinesses}
                className="px-4 py-2 text-sm bg-[#0C6B4B] text-white rounded-lg hover:bg-[#0a573b]">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add ui/src/pages/UsersPage.tsx
git commit -m "feat: UsersPage — gestión de contadores y asignación de clientes"
```

---

## Task 10: Frontend — DashboardPage muestra botón "Usuarios" si es admin

**Files:**
- Modify: `ui/src/pages/DashboardPage.tsx`

**Step 1: Agregar prop `isAdmin` y `onViewUsers` a DashboardPage**

Buscar el `interface DashboardPageProps` (o similar) y agregar:
```typescript
isAdmin?: boolean;
onViewUsers?: () => void;
```

**Step 2: Agregar botón en la barra de herramientas del Dashboard**

En el área donde están los botones de "Historial" / "Scraper", agregar (solo si `isAdmin`):
```tsx
{isAdmin && onViewUsers && (
  <button
    onClick={onViewUsers}
    className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100"
  >
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
    Usuarios
  </button>
)}
```

**Step 3: Commit**
```bash
git add ui/src/pages/DashboardPage.tsx
git commit -m "feat: DashboardPage — botón Usuarios para admins"
```

---

## Task 11: Frontend — Página de Registro público

**Files:**
- Create: `ui/src/pages/RegisterPage.tsx`
- Modify: `ui/src/pages/LoginPage.tsx` (activar link "Regístrate")
- Modify: `ui/src/App.tsx` (manejar vista de registro)

**Step 1: Crear RegisterPage.tsx**

```tsx
import { useState } from 'react';
import { registerWorkspace } from '../services';

interface Props {
  onRegisterSuccess: () => void;
  onBack: () => void;
}

export function RegisterPage({ onRegisterSuccess, onBack }: Props) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', password_confirmation: '', workspace_name: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.password_confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await registerWorkspace(form);
      localStorage.setItem('auth_token', data.token);
      onRegisterSuccess();
    } catch (err: any) {
      setError(err.message || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      <div className="hidden lg:flex lg:flex-col lg:w-1/2 bg-[#0C6B4B] text-white p-12 justify-between">
        <div className="flex items-center space-x-3">
          <img src="/img/fiscalio-logo.png" alt="Fiscalio" className="h-10 object-contain" />
          <span className="text-2xl font-bold">Fiscalio</span>
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold leading-tight">
            "Tu despacho en la nube,<br />listo en minutos."
          </h1>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-32">
        <div className="w-full max-w-md mx-auto">
          <h2 className="text-3xl font-extrabold text-gray-900">Crear cuenta</h2>
          <p className="mt-2 text-sm text-gray-600">Registra tu despacho contable.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre del despacho</label>
              <input type="text" required value={form.workspace_name}
                onChange={e => setForm(f => ({ ...f, workspace_name: e.target.value }))}
                placeholder="Despacho López & Asociados"
                className="mt-1 w-full border rounded-lg px-3 py-3 text-sm focus:ring-[#0C6B4B] focus:border-[#0C6B4B] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Tu nombre</label>
              <input type="text" required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-3 text-sm focus:ring-[#0C6B4B] focus:border-[#0C6B4B] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Correo electrónico</label>
              <input type="email" required value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-3 text-sm focus:ring-[#0C6B4B] focus:border-[#0C6B4B] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Contraseña</label>
              <input type="password" required minLength={8} value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-3 text-sm focus:ring-[#0C6B4B] focus:border-[#0C6B4B] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Confirmar contraseña</label>
              <input type="password" required value={form.password_confirmation}
                onChange={e => setForm(f => ({ ...f, password_confirmation: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-3 text-sm focus:ring-[#0C6B4B] focus:border-[#0C6B4B] outline-none"
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-[#0C6B4B] text-white font-medium rounded-lg hover:bg-[#0a573b] disabled:opacity-50">
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            ¿Ya tienes cuenta?{' '}
            <button onClick={onBack} className="text-[#0C6B4B] font-medium hover:underline">
              Inicia sesión
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Actualizar LoginPage.tsx — activar link "Regístrate"**

Cambiar el link "Regístrate" de:
```tsx
<a href="#" className="font-medium text-[#0C6B4B] hover:text-[#0a573b]">Regístrate</a>
```
a (requiere prop `onRegister`):
```tsx
<button onClick={onRegister} className="font-medium text-[#0C6B4B] hover:text-[#0a573b]">
  Regístrate
</button>
```
Agregar `onRegister: () => void` a `LoginPageProps`.

**Step 3: Conectar en App.tsx**

```tsx
const [showRegister, setShowRegister] = useState(false);

// En el bloque `if (!isAuthenticated)`:
if (!isAuthenticated) {
  if (showRegister) {
    return <RegisterPage
      onRegisterSuccess={handleLoginSuccess}
      onBack={() => setShowRegister(false)}
    />;
  }
  return <LoginPage
    onLoginSuccess={handleLoginSuccess}
    onRegister={() => setShowRegister(true)}
  />;
}
```

**Step 4: Commit**
```bash
git add ui/src/pages/RegisterPage.tsx ui/src/pages/LoginPage.tsx ui/src/App.tsx
git commit -m "feat: RegisterPage — registro público crea workspace + admin"
```

---

## Task 12: Limpiar LoginPage — quitar credenciales hardcodeadas

**Files:**
- Modify: `ui/src/pages/LoginPage.tsx`

**Step 1: Cambiar valores iniciales de `email` y `password`**

```tsx
// ANTES:
const [email, setEmail] = useState('1');
const [password, setPassword] = useState('1');

// DESPUÉS:
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
```

**Step 2: Commit**
```bash
git add ui/src/pages/LoginPage.tsx
git commit -m "fix: quitar credenciales hardcodeadas del LoginPage"
```

---

## Task 13: Deploy y verificación

**Step 1: Deploy**
```bash
# (usar skill /deploy)
```

**Step 2: Verificar en producción**
- Entrar como admin → debe ver botón "Usuarios" en dashboard
- Crear un contador desde la UI
- Asignar 2-3 clientes al contador
- Hacer login con el contador → solo debe ver esos clientes
- Probar registro desde link "Regístrate"

**Step 3: Actualizar PLANNING.md → HISTORY.md**

---

## Orden de implementación sugerido

1. Task 1 (Middleware) → Task 2 (User helper) → Task 3 (ClientController filter) — **base de seguridad**
2. Task 4 (UserController) + rutas
3. Task 5 (Register endpoint) + Task 6 (Login response)
4. Task 7-8 (Services + App.tsx)
5. Task 9-11 (UI completa)
6. Task 12 (cleanup)
7. Task 13 (deploy + verificar)
