import {
  IonAlert,
  IonBadge,
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonModal,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonToast,
  IonToolbar,
  IonTitle,
  IonHeader,
} from '@ionic/react';
import { addOutline, createOutline, leafOutline, locationOutline, trashOutline } from 'ionicons/icons';
import {
  onValue,
  push,
  remove,
  set,
  update,
} from 'firebase/database';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/useAuth';
import { database } from '../firebase';
import { getStoredInventory, inventoryFromSnapshot, inventoryItemRef, inventoryRef, persistInventory, type SeedBatch, type SeedCategory } from '../data/seedlink';

const categories: SeedCategory[] = ['Rice', 'Fruit', 'Vegetables'];

const InventoryView: React.FC = () => {
  const { profile } = useAuth();
  const canManage = profile?.role === 'admin' || profile?.role === 'depot_manager';
  const [batches, setBatches] = useState<SeedBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingBatch, setEditingBatch] = useState<SeedBatch | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [seedName, setSeedName] = useState('');
  const [category, setCategory] = useState<SeedCategory>('Rice');
  const [stock, setStock] = useState('');
  const [municipality, setMunicipality] = useState(profile?.municipality ?? 'Naujan');
  const [batchCode, setBatchCode] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [depot, setDepot] = useState(profile?.depot ?? '');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SeedBatch | null>(null);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    if (!database) {
      setBatches(getStoredInventory());
      setIsLoading(false);
      setError('');
      return;
    }

    const unsubscribe = onValue(
      inventoryRef()!,
      (snapshot) => {
        const allBatches = inventoryFromSnapshot(snapshot);
        const visibleBatches = profile?.role === 'depot_manager' && profile.depot
          ? allBatches.filter((batch) => batch.depot === profile.depot)
          : allBatches;
        setBatches(visibleBatches.sort((first, second) => first.seedName.localeCompare(second.seedName)));
        setIsLoading(false);
        setError('');
      },
      (syncError) => {
        setIsLoading(false);
        setError(syncError.message || 'Could not load the inventory.');
      },
    );
    return () => unsubscribe?.();
  }, [profile?.depot, profile?.role]);

  const totalStock = batches.reduce((total, batch) => total + (Number(batch.stock) || 0), 0);
  const categoriesInStock = useMemo(() => new Set(batches.map((batch) => batch.category)).size, [batches]);

  const openEditor = (batch?: SeedBatch) => {
    setEditingBatch(batch ?? null);
    setSeedName(batch?.seedName ?? '');
    setCategory(batch?.category ?? 'Rice');
    setStock(batch ? String(batch.stock) : '');
    setMunicipality(batch?.municipality ?? profile?.municipality ?? 'Naujan');
    setBatchCode(batch?.batchCode ?? '');
    setExpiryDate(batch?.expiryDate ?? '');
    setImageUrl(batch?.imageUrl ?? '');
    setDepot(batch?.depot ?? profile?.depot ?? '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = Number(stock);
    if (!seedName.trim() || !municipality.trim() || !batchCode.trim() || !depot.trim() || !Number.isInteger(quantity) || quantity < 0) {
      setFormError('Complete all required fields and enter a whole-number stock quantity of 0 or more.');
      return;
    }

    const normalizedImageUrl = imageUrl.trim();
    if (!editingBatch && !normalizedImageUrl) {
      setFormError('Add an image URL for this seed batch.');
      return;
    }
    if (normalizedImageUrl) {
      try {
        const parsedImageUrl = new URL(normalizedImageUrl);
        if (parsedImageUrl.protocol !== 'http:' && parsedImageUrl.protocol !== 'https:') throw new Error();
      } catch {
        setFormError('Enter a valid HTTP or HTTPS image URL.');
        return;
      }
    }

    setIsSaving(true);
    setFormError('');
    try {
      const batchData = {
        seedName: seedName.trim(),
        category,
        stock: quantity,
        municipality: municipality.trim(),
        batchCode: batchCode.trim(),
        expiryDate,
        depot: depot.trim(),
        imageUrl: normalizedImageUrl,
      };

      if (!database) {
        const currentBatches = getStoredInventory();
        if (editingBatch) {
          const nextBatches = currentBatches.map((batch) => batch.id === editingBatch.id ? {
            ...batch,
            ...batchData,
            updatedAt: new Date().toISOString(),
          } : batch);
          persistInventory(nextBatches);
          setBatches(nextBatches);
          setToastMessage('Batch details updated');
        } else {
          const newBatch: SeedBatch = {
            id: `demo-batch-${Date.now()}`,
            ...batchData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const nextBatches = [...currentBatches, newBatch];
          persistInventory(nextBatches);
          setBatches(nextBatches);
          setToastMessage('Seed batch added');
        }
        setIsModalOpen(false);
        return;
      }

      const timestamp = new Date().toISOString();
      if (editingBatch) {
        await update(inventoryItemRef(editingBatch.id)!, { ...batchData, updatedAt: timestamp });
        setToastMessage('Batch details updated');
      } else {
        const newBatchRef = push(inventoryRef()!);
        if (!newBatchRef.key) throw new Error('Could not create a seed batch ID.');
        await set(newBatchRef, { ...batchData, createdAt: timestamp, updatedAt: timestamp });
        setToastMessage('Seed batch added');
      }
      setIsModalOpen(false);
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Could not save this batch.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (batch: SeedBatch) => {
    setPendingDelete(null);
    try {
      if (!database) {
        const nextBatches = getStoredInventory().filter((item) => item.id !== batch.id);
        persistInventory(nextBatches);
        setBatches(nextBatches);
        setToastMessage('Seed batch deleted');
        return;
      }
      await remove(inventoryItemRef(batch.id)!);
      setToastMessage('Seed batch deleted');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete this batch.');
    }
  };

  return (
    <section className="role-workspace">
      <section className="summary-grid" aria-label="Inventory summary">
        <article className="summary-item"><span className="summary-icon icon-green"><IonIcon icon={leafOutline} /></span><div><span className="summary-label">Seed batches</span><strong>{batches.length}</strong></div></article>
        <article className="summary-item"><span className="summary-icon icon-yellow"><IonIcon icon={addOutline} /></span><div><span className="summary-label">Bags in stock</span><strong>{totalStock.toLocaleString()}</strong></div></article>
        <article className="summary-item"><span className="summary-icon icon-coral"><IonIcon icon={locationOutline} /></span><div><span className="summary-label">Categories</span><strong>{categoriesInStock}</strong></div></article>
      </section>

      <section className="inventory-panel" aria-labelledby="inventory-title">
        <div className="panel-heading">
          <div><h2 id="inventory-title">Seed batches</h2><p>{canManage ? 'Track stock, batch codes, depots, and expiry dates.' : 'Available seed stock across the province.'}</p></div>
          {canManage && <IonButton className="add-button" onClick={() => openEditor()}><IonIcon slot="start" icon={addOutline} />Add batch</IonButton>}
        </div>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {isLoading ? <div className="loading-state"><IonSpinner name="crescent" /><span>Loading live inventory…</span></div> : batches.length ? (
          <IonList className="batch-list" lines="none">
            {batches.map((batch) => (
              <article className="batch-row inventory-batch-row" key={batch.id}>
                {batch.imageUrl ? <img className="batch-image" src={batch.imageUrl} alt={`${batch.seedName} seeds`} loading="lazy" /> : <span className="batch-mark"><IonIcon icon={leafOutline} /></span>}
                <div className="batch-details">
                  <h3>{batch.seedName}</h3>
                  <span className="batch-location"><IonIcon icon={locationOutline} />{batch.municipality} · {batch.depot || 'Depot not set'}</span>
                  <span className="batch-meta">{batch.category} · {batch.batchCode}{batch.expiryDate ? ` · Expires ${batch.expiryDate}` : ''}</span>
                </div>
                <div className="stock-cell"><IonBadge className={batch.stock > 0 ? 'stock-badge' : 'stock-badge is-empty'}>{Number(batch.stock).toLocaleString()} bags</IonBadge></div>
                {canManage && <div className="row-actions">
                  <IonButton fill="clear" className="icon-button edit-action" onClick={() => openEditor(batch)} aria-label={`Edit ${batch.seedName}`}><IonIcon slot="icon-only" icon={createOutline} /></IonButton>
                  <IonButton fill="clear" className="icon-button delete-action" onClick={() => setPendingDelete(batch)} aria-label={`Delete ${batch.seedName}`}><IonIcon slot="icon-only" icon={trashOutline} /></IonButton>
                </div>}
              </article>
            ))}
          </IonList>
        ) : <div className="empty-state"><span className="empty-mark"><IonIcon icon={leafOutline} /></span><h3>No seed batches yet</h3><p>{canManage ? 'Add the first batch to start your live stock log.' : 'Check back with your local agriculture office for available seed allocations.'}</p></div>}
      </section>

      <IonModal isOpen={isModalOpen} onDidDismiss={() => !isSaving && setIsModalOpen(false)} className="seed-modal">
        <IonHeader><IonToolbar className="modal-toolbar"><IonTitle>{editingBatch ? 'Edit seed batch' : 'Add seed batch'}</IonTitle></IonToolbar></IonHeader>
        <IonContent className="modal-content">
          <form className="batch-form logistics-form" onSubmit={(event) => void handleSave(event)}>
            <IonItem className="form-field" lines="none"><IonInput label="Seed variety" labelPlacement="stacked" value={seedName} maxlength={80} onIonInput={(event) => setSeedName(event.detail.value ?? '')} required /></IonItem>
            <IonItem className="form-field" lines="none"><IonSelect label="Category" labelPlacement="stacked" value={category} onIonChange={(event) => setCategory(event.detail.value)}>{categories.map((item) => <IonSelectOption key={item} value={item}>{item}</IonSelectOption>)}</IonSelect></IonItem>
            <IonItem className="form-field" lines="none"><IonInput label="Batch code" labelPlacement="stacked" value={batchCode} maxlength={40} onIonInput={(event) => setBatchCode(event.detail.value ?? '')} required /></IonItem>
            <IonItem className="form-field" lines="none"><IonInput label="Stock quantity (bags)" labelPlacement="stacked" type="number" min="0" step="1" inputmode="numeric" value={stock} onIonInput={(event) => setStock(event.detail.value ?? '')} required /></IonItem>
            <IonItem className="form-field" lines="none"><IonInput label="Municipality" labelPlacement="stacked" value={municipality} maxlength={80} onIonInput={(event) => setMunicipality(event.detail.value ?? '')} required /></IonItem>
            <IonItem className="form-field" lines="none"><IonInput label="Depot / distribution hub" labelPlacement="stacked" placeholder="e.g. Naujan Central Hub" value={depot} maxlength={100} onIonInput={(event) => setDepot(event.detail.value ?? '')} required /></IonItem>
            <IonItem className="form-field" lines="none"><IonInput label="Seed image URL" labelPlacement="stacked" type="url" placeholder="https://example.com/seed-image.jpg" value={imageUrl} maxlength={2048} onIonInput={(event) => setImageUrl(event.detail.value ?? '')} required={!editingBatch} /></IonItem>
            <IonItem className="form-field" lines="none"><IonInput label="Expiry date" labelPlacement="stacked" type="date" value={expiryDate} onIonInput={(event) => setExpiryDate(event.detail.value ?? '')} /></IonItem>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="form-actions"><IonButton fill="clear" color="medium" onClick={() => setIsModalOpen(false)} disabled={isSaving}>Cancel</IonButton><IonButton type="submit" className="save-button" disabled={isSaving}>{isSaving ? <IonSpinner name="dots" /> : 'Save batch'}</IonButton></div>
          </form>
        </IonContent>
      </IonModal>
      <IonAlert isOpen={pendingDelete !== null} header="Delete seed batch?" message={pendingDelete ? `${pendingDelete.seedName} will be removed from the inventory.` : ''} buttons={[{ text: 'Cancel', role: 'cancel' }, { text: 'Delete batch', role: 'destructive', handler: () => { if (pendingDelete) void handleDelete(pendingDelete); } }]} onDidDismiss={() => setPendingDelete(null)} />
      <IonToast isOpen={Boolean(toastMessage)} message={toastMessage} duration={2400} onDidDismiss={() => setToastMessage('')} />
    </section>
  );
};

export default InventoryView;