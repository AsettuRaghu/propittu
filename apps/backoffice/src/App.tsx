import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { StaffGate } from './auth/Session';
import { Shell } from './layout/Shell';
import { Dashboard } from './pages/Dashboard';
import { Requests } from './pages/Requests';
import { Support } from './pages/Support';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StaffGate>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Dashboard />} />
              <Route path="requests" element={<Requests />} />
              <Route path="support" element={<Support />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </StaffGate>
    </QueryClientProvider>
  );
}
