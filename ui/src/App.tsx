import { useState, useEffect } from 'react';
import { InvoicesPage } from './pages/InvoicesPage'
import { DashboardPage } from './pages/DashboardPage'
import { SatRequestsHistoryPage } from './pages/SatRequestsHistoryPage'
import { LoginPage } from './pages/LoginPage'
import { ErrorBoundary } from './ErrorBoundary'
import { getToken } from './services'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getToken());
  const [activeRfc, setActiveRfc] = useState(localStorage.getItem('active_rfc') || '');
  const [activeClientName, setActiveClientName] = useState(localStorage.getItem('active_client_name') || '');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const handleAuthExpired = () => {
      setIsAuthenticated(false);
    };

    window.addEventListener('auth_token_expired', handleAuthExpired);
    return () => {
      window.removeEventListener('auth_token_expired', handleAuthExpired);
    };
  }, []);

  const handleSelectClient = (rfc: string, name: string) => {
    localStorage.setItem('active_rfc', rfc);
    localStorage.setItem('active_client_name', name);
    setActiveRfc(rfc);
    setActiveClientName(name);
    setShowHistory(false);
  };

  const handleBackToDashboard = () => {
    localStorage.removeItem('active_rfc');
    localStorage.removeItem('active_client_name');
    setActiveRfc('');
    setActiveClientName('');
    setShowHistory(false);
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <ErrorBoundary>
      {activeRfc ? (
        <InvoicesPage
          activeRfc={activeRfc}
          clientName={activeClientName}
          onBack={handleBackToDashboard}
        />
      ) : showHistory ? (
        <SatRequestsHistoryPage onBack={() => setShowHistory(false)} />
      ) : (
        <DashboardPage
          onSelectClient={handleSelectClient}
          onViewHistory={() => setShowHistory(true)}
        />
      )}
    </ErrorBoundary>
  )
}

export default App
