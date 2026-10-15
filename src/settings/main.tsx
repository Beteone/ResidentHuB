import { createRoot } from 'react-dom/client';
import { SettingsLayout } from './SettingsLayout';
import { ActivityLogPage } from './ActivityLogPage';

const element = document.getElementById('settings-root');
const params = new URLSearchParams(window.location.search);
if (element) createRoot(element).render(params.get('view') === 'activity'
    ? <ActivityLogPage actorId={params.get('actor') || 'standalone'} demo={params.get('demo') === '1'} />
    : <SettingsLayout actor={{ id: 'settings-preview', name: 'Nguyễn Minh Anh', role: 'manager' }} demo />);
