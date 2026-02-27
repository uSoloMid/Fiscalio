import React, { useState } from 'react';
import { login } from '../services';

interface LoginPageProps {
    onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
    const [email, setEmail] = useState('1');
    const [password, setPassword] = useState('1');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const data = await login(email, password);
            if (data.token) {
                localStorage.setItem('auth_token', data.token);
                onLoginSuccess();
            } else {
                setError('Respuesta del servidor inválida.');
            }
        } catch (err: any) {
            setError(err.message || 'Error al iniciar sesión');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-white">
            {/* Sidebar verde oscuro */}
            <div className="hidden lg:flex lg:flex-col lg:w-1/2 bg-[#0C6B4B] text-white p-12 justify-between">
                <div className="flex items-center space-x-3">
                    <img src="/img/fiscalio-logo.png" alt="Fiscalio Logo" className="h-10 object-contain" />
                    <span className="text-2xl font-bold tracking-tight">Fiscalio</span>
                </div>

                <div className="space-y-6">
                    <h1 className="text-4xl font-semibold leading-tight">
                        "Simplificando tu<br />contabilidad, una factura a<br />la vez."
                    </h1>
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-white/20">
                            <img src="/img/foto-fiscalio.jpg" alt="Avatar" className="w-full h-full object-cover" />
                        </div>
                        <div>
                            <p className="font-semibold text-lg">Control de Facturas</p>
                            <p className="text-xs text-green-200 uppercase tracking-widest font-semibold mt-1">Sistema Fiscalio</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Área de formulario */}
            <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-32 relative">
                <div className="w-full max-w-md mx-auto">
                    {/* Logo en movil */}
                    <div className="lg:hidden flex items-center mb-8 space-x-3 text-[#0C6B4B]">
                        <img src="/img/fiscalio-logo.png" alt="Fiscalio Logo" className="h-8 object-contain" />
                        <span className="text-2xl font-bold tracking-tight">Fiscalio</span>
                    </div>

                    <h2 className="mt-6 text-3xl font-extrabold text-gray-900">Iniciar Sesión</h2>
                    <p className="mt-2 text-sm text-gray-600">Ingresa tus datos para acceder a tu panel.</p>

                    <div className="mt-8">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Correo electrónico</label>
                                <div className="mt-1">
                                    <input
                                        type="text"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className={`appearance-none block w-full px-3 py-3 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#0C6B4B] focus:border-[#0C6B4B] sm:text-sm ${error ? 'border-red-500' : 'border-gray-300'
                                            }`}
                                        placeholder="usuario@fiscalio.com"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between">
                                    <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                                    <a href="#" className="text-sm font-medium text-[#0C6B4B] hover:text-[#0a573b]">
                                        ¿Olvidaste tu contraseña?
                                    </a>
                                </div>
                                <div className="mt-1 relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="appearance-none block w-full px-3 py-3 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#0C6B4B] focus:border-[#0C6B4B] sm:text-sm pr-12"
                                        placeholder="••••••••"
                                    />
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5">
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-gray-400 font-medium cursor-pointer focus:outline-none">
                                            {showPassword ? 'OCULTAR' : 'VER 👁'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <div className="text-red-500 text-sm font-medium flex items-center">
                                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    {error}
                                </div>
                            )}

                            <div>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#0C6B4B] hover:bg-[#0a573b] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0C6B4B] disabled:opacity-50 transition"
                                >
                                    {isLoading ? 'Iniciando...' : 'Entrar'}
                                </button>
                            </div>
                        </form>

                        <div className="mt-6">
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-300" />
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span className="px-2 bg-white text-gray-500">o continuar con</span>
                                </div>
                            </div>

                            <div className="mt-6">
                                <button
                                    type="button"
                                    disabled
                                    className="w-full inline-flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 opacity-50 cursor-not-allowed"
                                >
                                    <span className="mr-2">G</span> Iniciar con Google
                                </button>
                            </div>
                        </div>

                        <div className="mt-6 text-center text-sm">
                            <span className="text-gray-500">¿No tienes cuenta? </span>
                            <a href="#" className="font-medium text-[#0C6B4B] hover:text-[#0a573b]">
                                Regístrate
                            </a>
                        </div>

                    </div>
                </div>

                {/* Footer links */}
                <div className="absolute bottom-6 left-0 right-0 text-center text-xs font-semibold text-gray-400 space-x-6">
                    <a href="#" className="hover:text-gray-600">TÉRMINOS</a>
                    <a href="#" className="hover:text-gray-600">PRIVACIDAD</a>
                    <a href="#" className="hover:text-gray-600">AYUDA</a>
                </div>
            </div>
        </div>
    );
}
