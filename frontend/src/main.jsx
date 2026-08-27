import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App'
import ManualInputPage from './pages/ManualInputPage'
import XmlImportPage from './pages/XmlImportPage'
import ResultsPage from './pages/ResultsPage'
import ScenarioPage from './pages/ScenarioPage'
import SettingsPage from './pages/SettingsPage'
import HistoryPage from './pages/HistoryPage'
import JsonImportPage from './pages/JsonImportPage'
import MultiScenarioPage from './pages/MultiScenarioPage'
import { ResultsProvider } from './hooks/useResultsStore'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ResultsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<Navigate to="/manual" replace />} />
            <Route path="manual" element={<ManualInputPage />} />
            <Route path="import" element={<XmlImportPage />} />
            <Route path="results" element={<ResultsPage />} />
            <Route path="scenarios" element={<ScenarioPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="json-import" element={<JsonImportPage />} />
            <Route path="multi-scenario" element={<MultiScenarioPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ResultsProvider>
  </React.StrictMode>
)
