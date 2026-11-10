import { Navigate, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, IonToast, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { useEffect, useState } from 'react';
import Home from './pages/RoleWorkspace';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { AuthProvider } from './auth/AuthContext';
import { useAuth } from './auth/useAuth';
import { IonContent, IonPage, IonSpinner } from '@ionic/react';
import { listenForForegroundPush } from './data/pushNotifications';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/* Theme variables */
import './theme/variables.css';

setupIonicReact();

const ProtectedHome: React.FC = () => {
  const { user, profile, isLoading } = useAuth();

  if (isLoading) {
    return <IonPage><IonContent className="inventory-content"><div className="loading-state"><IonSpinner name="crescent" /></div></IonContent></IonPage>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return profile ? <Home /> : <Navigate to="/login" replace />;
};

const ForegroundPushToast: React.FC = () => {
  const [notification, setNotification] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => listenForForegroundPush(setNotification), []);

  return (
    <IonToast
      isOpen={Boolean(notification)}
      header={notification?.title}
      message={notification?.body}
      duration={6000}
      position="top"
      buttons={[{ text: 'Close', role: 'cancel' }]}
      onDidDismiss={() => setNotification(null)}
    />
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <IonApp>
      <IonReactRouter basename={import.meta.env.BASE_URL}>
      <IonRouterOutlet>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/home" element={<ProtectedHome />} />
        <Route path="/" element={<Landing />} />
      </IonRouterOutlet>
      </IonReactRouter>
      <ForegroundPushToast />
    </IonApp>
  </AuthProvider>
);

export default App;
