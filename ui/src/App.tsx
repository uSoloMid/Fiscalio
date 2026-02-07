import { useState } from 'react';
import { InvoicesPage } from './pages/InvoicesPage'
import { DashboardPage } from './pages/DashboardPage'
import { ErrorBoundary } from './ErrorBoundary'

function App() {
  const [activeRfc, setActiveRfc] = useState(localStorage.getItem('active_rfc') || '');
  const [activeClientName, setActiveClientName] = useState(localStorage.getItem('active_client_name') || '');

  const handleSelectClient = (rfc: string, name: string) => {
    localStorage.setItem('active_rfc', rfc);
    localStorage.setItem('active_client_name', name);
    setActiveRfc(rfc);
    setActiveClientName(name);
  };

  const handleBackToDashboard = () => {
    localStorage.removeItem('active_rfc');
    localStorage.removeItem('active_client_name');
    setActiveRfc('');
    setActiveClientName('');
  };

  return (
    <ErrorBoundary>
      {activeRfc ? (
        <InvoicesPage
          activeRfc={activeRfc}
          clientName={activeClientName}
          onBack={handleBackToDashboard}
        />
      ) : (
        <DashboardPage onSelectClient={handleSelectClient} />
      )}
    </ErrorBoundary>
  )
}

export default App
