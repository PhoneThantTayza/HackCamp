import React from 'react';
import { createRoot } from 'react-dom/client';
import DesktopApp from './DesktopApp.jsx';
import './desktop.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><DesktopApp /></React.StrictMode>);
