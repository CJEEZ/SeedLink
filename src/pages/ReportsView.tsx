import { IonButton, IonIcon, IonSpinner } from '@ionic/react';
import { downloadOutline, statsChartOutline } from 'ionicons/icons';
import { equalTo, onValue, orderByChild, query } from 'firebase/database';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { database } from '../firebase';
import { getStoredInventory, getStoredRequests, inventoryFromSnapshot, inventoryRef, requestsFromSnapshot, requestsRef, type AllocationRequest, type SeedBatch } from '../data/seedlink';

const csvCell = (value: string | number) => {
  const safeValue = String(value).replace(/^[=+@-]/, "'$&");
  return `"${safeValue.replaceAll('"', '""')}"`;
};

const categoryColors = ['#56805c', '#d56d55', '#d2a140', '#4e8c78', '#7185c1', '#a16e9d', '#558fa5', '#a07850'];

const ReportsView: React.FC = () => {
  const { profile, user } = useAuth();
  const [batches, setBatches] = useState<SeedBatch[]>([]);
  const [requests, setRequests] = useState<AllocationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState('');
  const [requestsError, setRequestsError] = useState('');

  useEffect(() => {
    setIsLoading(true);
    setInventoryError('');
    setRequestsError('');

    if (!database) {
      const inventory = getStoredInventory();
      const allocationRequests = getStoredRequests();
      setBatches(inventory);
      setRequests(allocationRequests);
      setIsLoading(false);
      return;
    }

    if (!profile || !user) {
      setBatches([]);
      setRequests([]);
      setIsLoading(false);
      return;
    }

    let inventoryLoaded = false;
    let requestsLoaded = false;
    const refreshLoading = () => setIsLoading(!(inventoryLoaded && requestsLoaded));
    const unsubscribeInventory = onValue(inventoryRef()!, (snapshot) => {
      const allBatches = inventoryFromSnapshot(snapshot);
      setBatches(profile?.role === 'depot_manager' && profile.depot
        ? allBatches.filter((batch) => batch.depot === profile.depot)
        : allBatches);
      inventoryLoaded = true;
      refreshLoading();
    }, (syncError) => {
      setInventoryError(syncError.message || 'Could not load inventory reporting data.');
      inventoryLoaded = true;
      refreshLoading();
    });
    const requestSource = profile.role === 'farmer'
      ? query(requestsRef()!, orderByChild('requesterUid'), equalTo(user.uid))
      : profile.role === 'depot_manager' && profile.depot
      ? query(requestsRef()!, orderByChild('depot'), equalTo(profile.depot))
      : profile.role === 'admin' || profile.role === 'executive'
        ? requestsRef()!
        : null;
    if (!requestSource) {
      setRequests([]);
      setIsLoading(false);
      setRequestsError('Your account is not authorized to view allocation reports.');
      return;
    }
    const unsubscribeRequests = onValue(requestSource, (snapshot) => {
      const allRequests = requestsFromSnapshot(snapshot);
      setRequests(allRequests);
      requestsLoaded = true;
      refreshLoading();
    }, (syncError) => {
      setRequestsError(syncError.message || 'Could not load allocation reporting data.');
      requestsLoaded = true;
      refreshLoading();
    });
    return () => {
      unsubscribeInventory();
      unsubscribeRequests();
    };
  }, [profile, user]);

  const scopedBatches = useMemo(
    () => batches,
    [batches],
  );
  const scopedRequests = useMemo(
    () => requests,
    [requests],
  );
  const totalStock = scopedBatches.reduce((total, batch) => total + (Number(batch.stock) || 0), 0);
  const deliveredRequests = scopedRequests.filter((request) => request.status === 'delivered').length;
  const decidedRequests = scopedRequests.filter((request) => request.status !== 'pending').length;
  const completionRate = scopedRequests.length ? Math.round((deliveredRequests / scopedRequests.length) * 100) : 0;
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    scopedBatches.forEach((batch) => counts.set(batch.category, (counts.get(batch.category) ?? 0) + (Number(batch.stock) || 0)));
    return [...counts.entries()].sort(([first], [second]) => first.localeCompare(second));
  }, [scopedBatches]);
  const stockChart = useMemo(() => {
    if (!totalStock) return [];

    let startAngle = -Math.PI / 2;
    return categoryCounts.map(([category, count], index) => {
      const endAngle = startAngle + (count / totalStock) * Math.PI * 2;
      const startX = 110 + 96 * Math.cos(startAngle);
      const startY = 110 + 96 * Math.sin(startAngle);
      const endX = 110 + 96 * Math.cos(endAngle);
      const endY = 110 + 96 * Math.sin(endAngle);
      const isFullCircle = count === totalStock;
      const path = isFullCircle
        ? ''
        : `M 110 110 L ${startX} ${startY} A 96 96 0 ${endAngle - startAngle > Math.PI ? 1 : 0} 1 ${endX} ${endY} Z`;
      const segment = {
        category,
        count,
        percentage: Math.round((count / totalStock) * 100),
        color: categoryColors[index % categoryColors.length],
        path,
        isFullCircle,
      };
      startAngle = endAngle;
      return segment;
    });
  }, [categoryCounts, totalStock]);
  const municipalityCounts = useMemo(() => {
    const counts = new Map<string, { batches: number; bags: number; requests: number }>();
    scopedBatches.forEach((batch) => {
      const current = counts.get(batch.municipality) ?? { batches: 0, bags: 0, requests: 0 };
      current.batches += 1;
      current.bags += Number(batch.stock) || 0;
      counts.set(batch.municipality, current);
    });
    scopedRequests.forEach((request) => {
      const current = counts.get(request.municipality) ?? { batches: 0, bags: 0, requests: 0 };
      current.requests += 1;
      counts.set(request.municipality, current);
    });
    return [...counts.entries()].sort(([first], [second]) => first.localeCompare(second));
  }, [scopedBatches, scopedRequests]);

  const downloadReport = () => {
    if (inventoryError) return;
    const rows = [
      ['Municipality', 'Seed variety', 'Category', 'Batch code', 'Bags in stock', 'Depot', 'Expiry date'],
      ...scopedBatches.map((batch) => [batch.municipality, batch.seedName, batch.category, batch.batchCode, batch.stock, batch.depot, batch.expiryDate]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `seedlink-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="role-workspace reports-workspace">
      <div className="report-toolbar">
        <div><p className="eyebrow">{profile?.role === 'executive' ? 'PROVINCIAL OVERSIGHT' : profile?.role === 'depot_manager' ? 'DEPOT OPERATIONS' : 'PROGRAM COMPLIANCE'}</p><h2>Distribution report</h2></div>
        <IonButton fill="outline" className="export-button" onClick={downloadReport} disabled={!scopedBatches.length || Boolean(inventoryError)}><IonIcon slot="start" icon={downloadOutline} />Export inventory CSV</IonButton>
      </div>
      {inventoryError && <div className="error-banner" role="alert">Inventory report unavailable: {inventoryError}</div>}
      {requestsError && <div className="error-banner" role="alert">Request report unavailable: {requestsError}</div>}
      {isLoading ? <div className="loading-state"><IonSpinner name="crescent" /><span>Preparing live report…</span></div> : <>
        <section className="summary-grid" aria-label="Program metrics">
          <article className="summary-item"><span className="summary-icon icon-green"><IonIcon icon={statsChartOutline} /></span><div><span className="summary-label">Bags in stock</span><strong>{inventoryError ? '—' : totalStock.toLocaleString()}</strong></div></article>
          <article className="summary-item"><span className="summary-icon icon-yellow"><IonIcon icon={downloadOutline} /></span><div><span className="summary-label">Allocation requests</span><strong>{requestsError ? '—' : scopedRequests.length}</strong></div></article>
          <article className="summary-item"><span className="summary-icon icon-coral"><IonIcon icon={statsChartOutline} /></span><div><span className="summary-label">Delivered</span><strong>{requestsError ? '—' : `${completionRate}%`}</strong></div></article>
        </section>

        <section className="report-grid">
          <article className="report-panel">
            <div className="report-panel-heading"><h3>Stock by category</h3><span>Bags</span></div>
            {inventoryError ? <p className="report-empty">Inventory data is unavailable.</p> : categoryCounts.length ? (
              <div className="report-category-chart">
                <div className="report-category-total"><strong>{totalStock.toLocaleString()}</strong><span>bags in stock</span></div>
                <div className="report-category-pie-layout">
                  <svg
                    className="report-category-pie"
                    viewBox="0 0 220 220"
                    role="img"
                    aria-label={`Stock by category in bags: ${categoryCounts.map(([category, count]) => `${category}, ${count}`).join('; ')}`}
                  >
                    <title>Stock by category</title>
                    <desc>Current share of available bags for each inventory category.</desc>
                    {stockChart.map(({ category, count, color, path, isFullCircle }) => (
                      isFullCircle
                        ? <circle key={category} cx="110" cy="110" r="96" fill={color}><title>{`${category}: ${count.toLocaleString()} bags`}</title></circle>
                        : <path key={category} d={path} fill={color} stroke="#fffefa" strokeWidth="2"><title>{`${category}: ${count.toLocaleString()} bags`}</title></path>
                    ))}
                  </svg>
                  <div className="report-category-legend">
                    {categoryCounts.map(([category, count], index) => {
                      const percentage = totalStock ? Math.round((count / totalStock) * 100) : 0;
                      return (
                        <div className="report-category-legend-row" key={category}>
                          <span className="report-category-name"><span className="report-category-dot" style={{ backgroundColor: categoryColors[index % categoryColors.length] }} />{category}</span>
                          <span className="report-category-value"><strong>{count.toLocaleString()} bags</strong><span>{percentage}%</span></span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : <p className="report-empty">No inventory recorded yet.</p>}
          </article>
          <article className="report-panel report-status-panel">
            <div className="report-panel-heading"><h3>Program execution</h3><span>Requests</span></div>
            <div className="execution-number">{completionRate}<small>%</small></div>
            <p>requests delivered</p>
            <div className="execution-breakdown"><span>Reviewed <strong>{decidedRequests}</strong></span><span>Awaiting review <strong>{scopedRequests.length - decidedRequests}</strong></span><span>Delivery confirmed <strong>{scopedRequests.filter((request) => request.deliveryVerified).length}</strong></span></div>
          </article>
        </section>

        <section className="inventory-panel report-table-panel">
          <div className="panel-heading"><div><h2>Municipal distribution</h2><p>Inventory coverage and allocation activity by locality</p></div><span className="batch-count">{municipalityCounts.length} municipalities</span></div>
          {municipalityCounts.length ? <div className="municipality-table-wrap"><table className="municipality-table"><thead><tr><th>Municipality</th><th>Seed batches</th><th>Bags in stock</th><th>Requests</th></tr></thead><tbody>{municipalityCounts.map(([place, totals]) => <tr key={place}><th scope="row">{place}</th><td>{inventoryError ? '—' : totals.batches}</td><td>{inventoryError ? '—' : totals.bags.toLocaleString()}</td><td>{requestsError ? '—' : totals.requests}</td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>{inventoryError || requestsError ? 'Distribution data unavailable' : 'No distribution data yet'}</h3><p>{inventoryError || requestsError ? 'Check the report errors above and try again.' : 'Inventory and allocation activity will appear here.'}</p></div>}
        </section>
      </>}
    </section>
  );
};

export default ReportsView;