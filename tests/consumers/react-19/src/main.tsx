import { createRoot } from 'react-dom/client';
import { ReactContractApp } from '../.generated/react-app';
import '@drasi/react/styles.css';

const container = document.getElementById('app');
if (!container) throw new Error('Missing application root');
createRoot(container).render(<ReactContractApp />);
