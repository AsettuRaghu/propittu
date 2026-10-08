import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { StaffGate } from './auth/Session';
import { LiveProvider } from './lib/live';
import { Shell } from './layout/Shell';
import { Coverage } from './pages/Coverage';
import { Customers } from './pages/Customers';
import { Legal } from './pages/Legal';
import { Value } from './pages/Value';
import { Watch } from './pages/Watch';
import { LegalReport } from './pages/LegalReport';
import { Dashboard } from './pages/Dashboard';
import { Payments } from './pages/Payments';
import { PlanPage } from './pages/PlanPage';
import { Plans } from './pages/Plans';
import { Pittu } from './pages/Pittu';
import { Reports } from './pages/Reports';
import { Requests } from './pages/Requests';
import { ServicePage } from './pages/ServicePage';
import { Services } from './pages/Services';
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
            <Route
              element={
                <LiveProvider>
                  <Shell />
                </LiveProvider>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="requests" element={<Requests />} />
              <Route path="support" element={<Support />} />
              <Route path="customers" element={<Customers />} />
              <Route path="payments" element={<Payments />} />
              <Route path="plans" element={<Plans />} />
              <Route path="plans/:id" element={<PlanPage />} />
              <Route path="services" element={<Services />} />
              <Route path="services/:id" element={<ServicePage />} />
              <Route path="coverage" element={<Coverage />} />
              <Route path="pittu" element={<Pittu />} />
              <Route path="reports" element={<Reports />} />
              <Route path="legal" element={<Legal />} />
              <Route path="watch" element={<Watch />} />
              <Route path="value" element={<Value />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
            {/* Printable report: no sidebar. */}
            <Route path="legal/:id/report" element={<LegalReport />} />
          </Routes>
        </BrowserRouter>
      </StaffGate>
    </QueryClientProvider>
  );
}
