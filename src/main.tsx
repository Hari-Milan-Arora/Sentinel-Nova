import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App';
import Landing from './pages/Landing';
import Login from './pages/Login';
import ProtectedRoute from './auth/ProtectedRoute';
import { AuthProvider } from './auth/AuthContext';
import { PlanningProfileProvider } from './context/PlanningProfileContext';
import { TaskProvider } from './context/TaskContext';
import { GoalProjectProvider } from './context/GoalProjectContext';
import { CalendarProvider } from './context/CalendarContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PlanningProfileProvider>
          <TaskProvider>
            <GoalProjectProvider>
              <CalendarProvider>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/app/*" element={<ProtectedRoute><App /></ProtectedRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </CalendarProvider>
            </GoalProjectProvider>
          </TaskProvider>
        </PlanningProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
