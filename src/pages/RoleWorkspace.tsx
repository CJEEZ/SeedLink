import { IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonPage, IonToolbar } from '@ionic/react';
import { barChartOutline, chatbubblesOutline, cubeOutline, logOutOutline, leafOutline, mapOutline, personCircleOutline, receiptOutline } from 'ionicons/icons';
import { useState } from 'react';
import type { StakeholderRole } from '../auth/authContextTypes';
import { useAuth } from '../auth/useAuth';
import InventoryView from './InventoryView';
import AdminProfileView from './AdminProfileView';
import FarmerProfileView from './FarmerProfileView';
import ReportsView from './ReportsView';
import RequestsView from './RequestsView';
import SupportView from './SupportView';
import './Home.css';

type WorkspaceSection = 'overview' | 'inventory' | 'requests' | 'allocations' | 'tracking' | 'profile' | 'support';

const roleLabels: Record<StakeholderRole, string> = {
  admin: 'Agriculture administrator',
  depot_manager: 'Depot & logistics',
  farmer: 'Farmer / cooperative',
  executive: 'Executive oversight',
};

const navigation: Record<StakeholderRole, { id: WorkspaceSection; label: string; icon: string }[]> = {
  admin: [
    { id: 'overview', label: 'Provincial overview', icon: barChartOutline },
    { id: 'inventory', label: 'Seed inventory', icon: cubeOutline },
    { id: 'requests', label: 'Allocation requests', icon: receiptOutline },
    { id: 'tracking', label: 'Delivery tracking', icon: mapOutline },
    { id: 'support', label: 'Customer service', icon: chatbubblesOutline },
    { id: 'profile', label: 'Admin profile', icon: personCircleOutline },
  ],
  depot_manager: [
    { id: 'overview', label: 'Depot overview', icon: barChartOutline },
    { id: 'inventory', label: 'Stock & batches', icon: cubeOutline },
    { id: 'requests', label: 'Request dispatch', icon: receiptOutline },
    { id: 'tracking', label: 'Delivery tracking', icon: mapOutline },
  ],
  farmer: [
    { id: 'allocations', label: 'Seed allocations', icon: leafOutline },
    { id: 'tracking', label: 'Delivery tracking', icon: mapOutline },
    { id: 'profile', label: 'Farmer profile', icon: personCircleOutline },
    { id: 'support', label: 'Customer service', icon: chatbubblesOutline },
  ],
  executive: [
    { id: 'overview', label: 'Provincial metrics', icon: barChartOutline },
    { id: 'tracking', label: 'Delivery tracking', icon: mapOutline },
  ],
};

const sectionHeadings: Record<WorkspaceSection, { title: string; description: string }> = {
  overview: { title: 'Program overview', description: 'A live view of seed resources and distribution progress.' },
  inventory: { title: 'Seed inventory', description: 'Track supply, batch traceability, and depot stock.' },
  requests: { title: 'Allocation requests', description: 'Review seed requests and coordinate delivery.' },
  allocations: { title: 'Seed allocations', description: 'Find available batches, request seed, and confirm deliveries.' },
  tracking: { title: 'Delivery tracking', description: 'Follow approved seed deliveries from depot to destination.' },
  profile: { title: 'Account profile', description: 'Your account details, access, and security settings.' },
  support: { title: 'Customer service', description: 'A private channel to ask questions and get help from SeedLink administrators.' },
};

const RoleWorkspace: React.FC = () => {
  const { profile, signOutUser } = useAuth();
  const role = profile?.role ?? 'farmer';
  const [activeSection, setActiveSection] = useState<WorkspaceSection>(role === 'farmer' ? 'allocations' : 'overview');
  const heading = sectionHeadings[activeSection];

  return (
    <IonPage>
      <IonHeader className="app-header">
        <IonToolbar className="topbar">
          <a className="brand" href="/home" slot="start" aria-label="SeedLink home">
            <span className="brand-mark"><img src="/Agricultural%20Logo%20for%20SeedLink%20(1).png" alt="" /></span>
            <span className="brand-copy"><strong>SeedLink</strong><small>ORIENTAL MINDORO</small></span>
          </a>
          <div className="workspace-account" slot="end">
            <span className="account-copy"><strong>{profile?.displayName}</strong><small>{roleLabels[role]}</small></span>
            <IonButton fill="outline" className="icon-button signout-button" onClick={() => void signOutUser()} aria-label="Sign out" title="Sign out">
              <IonIcon slot="start" icon={logOutOutline} />
              Sign out
            </IonButton>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent className="inventory-content">
        <main className="dashboard role-dashboard">
          <section className="page-heading role-heading">
            <div>
              <p className="eyebrow">{roleLabels[role].toUpperCase()}</p>
              <h1>{heading.title}</h1>
              <p className="page-description">{heading.description}</p>
            </div>
            {activeSection !== 'profile' && (profile?.municipality || profile?.depot) && <span className="profile-location">{profile.depot ?? profile.municipality}</span>}
          </section>

          {activeSection === 'inventory' && <InventoryView />}
          {activeSection === 'requests' && <RequestsView />}
          {activeSection === 'allocations' && <RequestsView />}
          {activeSection === 'tracking' && <RequestsView trackingOnly />}
          {activeSection === 'profile' && role === 'farmer' && <FarmerProfileView />}
          {activeSection === 'profile' && role === 'admin' && <AdminProfileView />}
          {activeSection === 'support' && (role === 'farmer' || role === 'admin') && <SupportView />}
          {activeSection === 'overview' && <ReportsView />}
          <footer className="page-footer"><span><span className="footer-dot" /> Live data from SeedLink</span><span>SEEDLINK · {new Date().getFullYear()}</span></footer>
        </main>
      </IonContent>
      <IonFooter className="workspace-bottom-footer">
        <nav className="role-navigation" aria-label="Workspace sections">
          {navigation[role].map((item) => (
            <IonButton
              key={item.id}
              fill={activeSection === item.id ? 'solid' : 'clear'}
              className={`role-nav-button ${activeSection === item.id ? 'is-active' : ''}`}
              onClick={() => setActiveSection(item.id)}
              aria-current={activeSection === item.id ? 'page' : undefined}
            >
              <span className="role-nav-content"><IonIcon icon={item.icon} /><span>{item.label}</span></span>
            </IonButton>
          ))}
        </nav>
      </IonFooter>
    </IonPage>
  );
};

export default RoleWorkspace;