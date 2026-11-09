import { HashRouter, Outlet, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { Home } from './pages/Home';
import { AppLayout } from './pages/AppLayout';
import { AppEditor } from './pages/AppEditor';
import { Sales } from './pages/Sales';
import { Integration } from './pages/Integration';
import { Storefront } from './pages/Storefront';

function DevShell() {
  return (
    <>
      <Header />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/store/:appId" element={<Storefront />} />
        <Route element={<DevShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/apps/:appId" element={<AppLayout />}>
            <Route index element={<AppEditor />} />
            <Route path="sales" element={<Sales />} />
            <Route path="integration" element={<Integration />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  );
}
