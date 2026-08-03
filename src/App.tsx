import { useState } from 'react';
import axios from 'axios';
import { User, Account, ViewType } from './types';
import Login from './components/Login';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import Transfer from './components/Transfer';
import History from './components/History';
import { API_CONFIG } from './apiConfig';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [activeView, setActiveView] = useState<ViewType>('DASHBOARD');

  const handleLoginSuccess = (loggedInUser: User, userAccounts: Account[]) => {
    setUser(loggedInUser);
    setAccounts(userAccounts);
    if (userAccounts.length > 0) {
      setActiveAccount(userAccounts[0]);
    }
    setActiveView('DASHBOARD');
  };

  const handleLogout = () => {
    setUser(null);
    setAccounts([]);
    setActiveAccount(null);
    setActiveView('DASHBOARD');
  };

  // Synchronize dynamic balances on transfer or deposit events
  const refreshAccounts = async () => {
    if (!user) return;
    try {
      const response = await axios.get(`${API_CONFIG.USER_SERVICE}/api/users/${user.id}/accounts`);
      const updatedAccounts = response.data;
      setAccounts(updatedAccounts);
      // Maintain selected account reference updated
      if (activeAccount) {
        const matching = updatedAccounts.find((a: Account) => a.id === activeAccount.id);
        if (matching) {
          setActiveAccount(matching);
        } else if (updatedAccounts.length > 0) {
          setActiveAccount(updatedAccounts[0]);
        }
      }
    } catch (err) {
      console.error('Error synchronizing user accounts state:', err);
    }
  };

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div id="simplebank-app" className="min-h-screen bg-[#F8F9FB] flex flex-col font-sans antialiased text-gray-900">
      
      {/* Navigation Layer */}
      <Navbar
        user={user}
        activeView={activeView}
        onViewChange={(view) => setActiveView(view)}
        onLogout={handleLogout}
      />

      {/* Main Content Area framed by container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeView === 'DASHBOARD' && (
          <Dashboard
            user={user}
            accounts={accounts}
            activeAccount={activeAccount}
            onSelectAccount={(acc) => setActiveAccount(acc)}
            onRefreshAccounts={refreshAccounts}
            onNavigateToTransfer={() => setActiveView('TRANSFER')}
            onNavigateToHistory={() => setActiveView('HISTORY')}
          />
        )}

        {activeView === 'TRANSFER' && (
          <Transfer
            user={user}
            accounts={accounts}
            activeAccount={activeAccount}
            onRefreshAccounts={refreshAccounts}
            onNavigateToDashboard={() => setActiveView('DASHBOARD')}
          />
        )}

        {activeView === 'HISTORY' && (
          <History
            user={user}
            accounts={accounts}
            activeAccount={activeAccount}
          />
        )}
      </main>

      {/* Footnote footer */}
      <footer className="bg-white border-t border-[#E9ECEF] py-6 text-center text-xs text-gray-400 font-medium mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <div>SimpleBank Learning Sandbox Portal. Runs on Node.js port 3000 container ingress routing.</div>
          <div className="font-mono text-[10px]">Secure UTC Clock: 2026-07-13</div>
        </div>
      </footer>

    </div>
  );
}
