import {
  IonAlert,
  IonBadge,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonModal,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react';
import { carOutline, checkmarkCircleOutline, chevronDownOutline, chevronUpOutline, createOutline, ellipsisHorizontalOutline, leafOutline, locationOutline, receiptOutline, trashOutline } from 'ionicons/icons';
import {
  equalTo,
  get,
  onValue,
  orderByChild,
  push,
  query,
  remove,
  ref,
  runTransaction,
  set,
  update,
} from 'firebase/database';
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type TouchEvent } from 'react';
import { useAuth } from '../auth/useAuth';
import { database } from '../firebase';
import DeliveryMap from '../components/DeliveryMap';
import {
  getStoredInventory,
  getStoredRequests,
  inventoryFromSnapshot,
  inventoryItemRef,
  inventoryRef,
  persistInventory,
  persistRequests,
  requestItemRef,
  requestsFromSnapshot,
  requestsRef,
  type AllocationRequest,
  type RequestStatus,
  type SeedBatch,
} from '../data/seedlink';

const statusLabels: Record<RequestStatus, string> = {
  pending: 'Awaiting review',
  approved: 'Approved',
  in_transit: 'In transit',
  delivered: 'Delivered',
  rejected: 'Not approved',
};

const deliveryStages: { status: RequestStatus; label: string }[] = [
  { status: 'approved', label: 'Approved' },
  { status: 'in_transit', label: 'In transit' },
  { status: 'delivered', label: 'Delivered' },
  { status: 'delivered', label: 'Received' },
];

const nextStatuses: Partial<Record<RequestStatus, RequestStatus[]>> = {
  pending: ['approved', 'rejected'],
  approved: ['in_transit'],
  in_transit: ['delivered'],
};

interface RequestsViewProps {
  trackingOnly?: boolean;
}

const RequestsView: React.FC<RequestsViewProps> = ({ trackingOnly = false }) => {
  const { user, profile } = useAuth();
  const isFarmer = profile?.role === 'farmer';
  const isStaff = profile?.role === 'admin' || profile?.role === 'depot_manager';
  const [requests, setRequests] = useState<AllocationRequest[]>([]);
  const [expandedDeliveryDetails, setExpandedDeliveryDetails] = useState<Set<string>>(() => new Set());
  const [availableBatches, setAvailableBatches] = useState<SeedBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [requestedBags, setRequestedBags] = useState('');
  const [destination, setDestination] = useState(profile?.municipality ?? '');
  const [requestNote, setRequestNote] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingFarmerRequestId, setEditingFarmerRequestId] = useState<string | null>(null);
  const [pendingDeleteRequest, setPendingDeleteRequest] = useState<AllocationRequest | null>(null);
  const [isDeletingRequest, setIsDeletingRequest] = useState(false);
  const [openSwipeRequestId, setOpenSwipeRequestId] = useState<string | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [editingRequest, setEditingRequest] = useState<AllocationRequest | null>(null);
  const [viewingBatchImage, setViewingBatchImage] = useState<SeedBatch | null>(null);
  const [reviewStatus, setReviewStatus] = useState<RequestStatus>('pending');
  const [truckId, setTruckId] = useState('');
  const [freightNote, setFreightNote] = useState('');
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    if (!database) {
      const nextRequests = getStoredRequests();
      setRequests(nextRequests.sort((first, second) => second.id.localeCompare(first.id)));
      setIsLoading(false);
      setError('');
      return;
    }

    if (!user || !profile) {
      setRequests([]);
      setIsLoading(false);
      setError('');
      return;
    }

    const allRequestsRef = requestsRef()!;
    const requestQuery = profile.role === 'farmer'
      ? query(allRequestsRef, orderByChild('requesterUid'), equalTo(user.uid))
      : profile.role === 'depot_manager' && profile.depot
        ? query(allRequestsRef, orderByChild('depot'), equalTo(profile.depot))
        : profile.role === 'admin' || profile.role === 'executive'
          ? allRequestsRef
          : null;
    if (!requestQuery) {
      setRequests([]);
      setIsLoading(false);
      setError('Your account is not authorized to view allocation requests.');
      return;
    }

    const unsubscribe = onValue(
      requestQuery,
      (snapshot) => {
        const results = requestsFromSnapshot(snapshot);
        setRequests(results.sort((first, second) => second.id.localeCompare(first.id)));
        setIsLoading(false);
        setError('');
      },
      (syncError) => {
        setIsLoading(false);
        setError(syncError.message || 'Could not load allocation requests.');
      },
    );
    return unsubscribe;
  }, [isFarmer, profile, user]);

  useEffect(() => {
    if (!database) {
      setAvailableBatches(getStoredInventory());
      return;
    }
    const unsubscribe = onValue(
      inventoryRef()!,
      (snapshot) => setAvailableBatches(
        inventoryFromSnapshot(snapshot),
      ),
      (syncError) => setError(syncError.message || 'Could not load seed batch details.'),
    );
    return unsubscribe;
  }, []);

  const selectedBatch = useMemo(
    () => availableBatches.find((batch) => batch.id === selectedBatchId),
    [availableBatches, selectedBatchId],
  );
  const availableBatchCount = availableBatches.filter((batch) => batch.stock > 0).length;
  const batchesById = useMemo(
    () => new Map(availableBatches.map((batch) => [batch.id, batch])),
    [availableBatches],
  );
  const farmerRequestBeingEdited = editingFarmerRequestId
    ? requests.find((request) => request.id === editingFarmerRequestId) ?? null
    : null;
  const visibleRequests = trackingOnly
    ? requests.filter((request) => (request.status === 'approved' || request.status === 'in_transit' || request.status === 'delivered') && !request.deliveryVerified)
    : isFarmer
      ? requests.filter((request) => !(request.status === 'delivered' && request.deliveryVerified))
      : requests;
  const recentOrders = isFarmer
    ? requests
      .filter((request) => request.status === 'delivered' && request.deliveryVerified)
      .sort((first, second) => (second.deliveryVerifiedAt ?? second.updatedAt ?? '').localeCompare(first.deliveryVerifiedAt ?? first.updatedAt ?? ''))
    : [];

  const requestAgain = (request: AllocationRequest) => {
    const batch = batchesById.get(request.batchId);
    if (!batch || Number(batch.stock) <= 0) {
      setFormError(`The ${request.seedName} batch from this order is no longer available. Choose an available batch instead.`);
      document.getElementById('request-seed-allocation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    setEditingFarmerRequestId(null);
    setSelectedBatchId(batch.id);
    setRequestedBags(String(Math.min(Number(request.requestedBags), Number(batch.stock))));
    setDestination(profile?.municipality ?? request.municipality);
    setRequestNote(request.note ?? '');
    setFormError('');
    document.getElementById('request-seed-allocation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = Number(requestedBags);
    if (!user || !profile || !selectedBatch || !destination.trim() || !Number.isInteger(quantity) || quantity < 1) {
      setFormError('Choose a seed batch, enter a whole-number quantity, and add a delivery municipality.');
      return;
    }
    if (farmerRequestBeingEdited && (farmerRequestBeingEdited.status !== 'pending' || farmerRequestBeingEdited.requesterUid !== user.uid)) {
      setFormError('This request is no longer editable. Refresh your requests and try again.');
      return;
    }
    const unchangedPendingQuantity = farmerRequestBeingEdited?.batchId === selectedBatch.id
      && quantity === farmerRequestBeingEdited.requestedBags;
    if (quantity > selectedBatch.stock && !unchangedPendingQuantity) {
      setFormError(`Only ${selectedBatch.stock} bags are currently listed for this batch.`);
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    try {
      if (!database) {
        const nextRequests = getStoredRequests();
        if (editingFarmerRequestId) {
          const currentRequest = nextRequests.find((request) => request.id === editingFarmerRequestId);
          if (!currentRequest || currentRequest.status !== 'pending' || currentRequest.requesterUid !== user.uid) {
            throw new Error('This request is no longer editable. Refresh your requests and try again.');
          }
          const updatedRequest: AllocationRequest = {
            ...currentRequest,
            batchId: selectedBatch.id,
            depot: selectedBatch.depot,
            seedName: selectedBatch.seedName,
            category: selectedBatch.category,
            requestedBags: quantity,
            municipality: destination.trim(),
            note: requestNote.trim(),
            updatedAt: new Date().toISOString(),
          };
          const updatedRequests = nextRequests.map((request) => request.id === currentRequest.id ? updatedRequest : request);
          persistRequests(updatedRequests);
          setRequests(updatedRequests.sort((first, second) => second.id.localeCompare(first.id)));
          setEditingFarmerRequestId(null);
          setSelectedBatchId('');
          setRequestedBags('');
          setRequestNote('');
          setToastMessage('Allocation request updated');
          return;
        }
        const newRequest: AllocationRequest = {
          id: `demo-request-${Date.now()}`,
          requesterUid: user.uid,
          requesterName: profile.displayName,
          batchId: selectedBatch.id,
          depot: selectedBatch.depot,
          seedName: selectedBatch.seedName,
          category: selectedBatch.category,
          requestedBags: quantity,
          municipality: destination.trim(),
          note: requestNote.trim(),
          status: 'pending',
          deliveryVerified: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        persistRequests([...nextRequests, newRequest]);
        setRequests([...nextRequests, newRequest].sort((first, second) => second.id.localeCompare(first.id)));
        setSelectedBatchId('');
        setRequestedBags('');
        setRequestNote('');
        setToastMessage('Allocation request submitted');
        return;
      }

      if (editingFarmerRequestId) {
        const requestRef = requestItemRef(editingFarmerRequestId)!;
        const batchSnapshot = await get(inventoryItemRef(selectedBatch.id)!);
        if (!batchSnapshot.exists()) throw new Error('The selected seed batch no longer exists.');
        const currentBatch = batchSnapshot.val() as SeedBatch;
        const samePendingQuantity = farmerRequestBeingEdited?.batchId === selectedBatch.id
          && quantity === Number(farmerRequestBeingEdited.requestedBags);
        if (quantity > Number(currentBatch.stock) && !samePendingQuantity) {
          throw new Error(`Only ${currentBatch.stock} bags are currently listed for this batch.`);
        }
        const updated = await runTransaction(requestRef, (currentRequest) => {
          if (!currentRequest || currentRequest.status !== 'pending' || currentRequest.requesterUid !== user.uid) return;
          return {
            ...currentRequest,
            batchId: selectedBatch.id,
            depot: currentBatch.depot,
            seedName: currentBatch.seedName,
            category: currentBatch.category,
            requestedBags: quantity,
            municipality: destination.trim(),
            note: requestNote.trim(),
            updatedAt: new Date().toISOString(),
          };
        });
        if (!updated.committed) throw new Error('This request is no longer editable. Refresh your requests and try again.');
      } else {
        const requestRef = push(requestsRef()!);
        if (!requestRef.key) throw new Error('Could not create an allocation request ID.');
        await set(requestRef, {
          requesterUid: user.uid,
          requesterName: profile.displayName,
          batchId: selectedBatch.id,
          depot: selectedBatch.depot,
          seedName: selectedBatch.seedName,
          category: selectedBatch.category,
          requestedBags: quantity,
          municipality: destination.trim(),
          note: requestNote.trim(),
          status: 'pending',
          deliveryVerified: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      setSelectedBatchId('');
      setRequestedBags('');
      setRequestNote('');
      setEditingFarmerRequestId(null);
      setToastMessage(editingFarmerRequestId ? 'Allocation request updated' : 'Allocation request submitted');
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'Could not submit this request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openFarmerEdit = (request: AllocationRequest) => {
    if (request.status !== 'pending' || request.requesterUid !== user?.uid) return;
    setEditingFarmerRequestId(request.id);
    setSelectedBatchId(request.batchId);
    setRequestedBags(String(request.requestedBags));
    setDestination(request.municipality);
    setRequestNote(request.note ?? '');
    setFormError('');
  };

  const cancelFarmerEdit = () => {
    setEditingFarmerRequestId(null);
    setSelectedBatchId('');
    setRequestedBags('');
    setRequestNote('');
    setDestination(profile?.municipality ?? '');
    setFormError('');
  };

  const deleteFarmerRequest = async () => {
    const request = pendingDeleteRequest;
    setPendingDeleteRequest(null);
    if (!request || request.status !== 'pending' || request.requesterUid !== user?.uid) return;
    setIsDeletingRequest(true);
    try {
      if (!database) {
        const currentRequests = getStoredRequests();
        const currentRequest = currentRequests.find((item) => item.id === request.id);
        if (!currentRequest || currentRequest.status !== 'pending' || currentRequest.requesterUid !== user.uid) {
          throw new Error('This request can no longer be deleted. Refresh your requests and try again.');
        }
        const remainingRequests = currentRequests.filter((item) => item.id !== request.id);
        persistRequests(remainingRequests);
        setRequests(remainingRequests.sort((first, second) => second.id.localeCompare(first.id)));
      } else {
        await remove(requestItemRef(request.id)!);
      }
      if (editingFarmerRequestId === request.id) cancelFarmerEdit();
      setToastMessage('Allocation request deleted');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete this request.');
    } finally {
      setIsDeletingRequest(false);
    }
  };

  const openReview = (request: AllocationRequest) => {
    setEditingRequest(request);
    setReviewStatus(request.status);
    setTruckId(request.truckId ?? '');
    setFreightNote(request.freightNote ?? '');
  };

  const saveReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingRequest) return;
    setIsSavingReview(true);
    setError('');
    try {
      if (!database) {
        const currentRequests = getStoredRequests();
        const nextRequests = currentRequests.map((request) => {
          if (request.id !== editingRequest.id) return request;
          const updatedRequest = {
            ...request,
            status: reviewStatus,
            truckId: truckId.trim(),
            freightNote: freightNote.trim(),
            updatedAt: new Date().toISOString(),
          };

          if (request.status === 'pending' && reviewStatus === 'approved') {
            const inventory = getStoredInventory().map((batch) => 
              batch.id === editingRequest.batchId
                ? { ...batch, stock: Math.max(0, Number(batch.stock) - Number(request.requestedBags)) }
                : batch,
            );
            persistInventory(inventory);
            setAvailableBatches(inventory.filter((batch) => batch.stock > 0));
          }

          return updatedRequest;
        });
        persistRequests(nextRequests);
        setRequests(nextRequests.sort((first, second) => second.id.localeCompare(first.id)));
        setEditingRequest(null);
        setToastMessage('Request and delivery details updated');
        return;
      }

      const requestRef = requestItemRef(editingRequest.id)!;
      const dispatchData = {
        status: reviewStatus,
        truckId: truckId.trim(),
        freightNote: freightNote.trim(),
        updatedAt: new Date().toISOString(),
      };

      if (editingRequest.status === 'pending' && reviewStatus === 'approved') {
        const requestSnapshot = await get(requestRef);
        if (!requestSnapshot.exists()) throw new Error('The request no longer exists.');
        const currentRequest = requestSnapshot.val() as AllocationRequest;
        if (currentRequest.status !== 'pending' || currentRequest.batchId !== editingRequest.batchId) {
          throw new Error('This request has already been reviewed. Refresh the queue and try again.');
        }
        const requestedQuantity = Number(currentRequest.requestedBags) || 0;
        const batchRef = inventoryItemRef(currentRequest.batchId)!;
        const stockReservation = await runTransaction(batchRef, (batch) => {
          if (!batch || Number(batch.stock) < requestedQuantity) return;
          return { ...batch, stock: Number(batch.stock) - requestedQuantity, updatedAt: new Date().toISOString() };
        });
        if (!stockReservation.committed) throw new Error('There is not enough stock to approve this allocation.');
        try {
          const approval = await runTransaction(requestRef, (request) => {
            if (!request || request.status !== 'pending' || request.batchId !== currentRequest.batchId) return;
            return { ...request, ...dispatchData };
          });
          if (!approval.committed) throw new Error('This request has already been reviewed. Refresh the queue and try again.');
        } catch (approvalError) {
          await runTransaction(batchRef, (batch) => batch
            ? { ...batch, stock: Number(batch.stock) + requestedQuantity, updatedAt: new Date().toISOString() }
            : undefined);
          throw approvalError;
        }
      } else {
        const allowed = nextStatuses[editingRequest.status] ?? [];
        if (reviewStatus !== editingRequest.status && !allowed.includes(reviewStatus)) {
          throw new Error('That request status transition is not allowed.');
        }
        const updateResult = await runTransaction(requestRef, (request) => {
          if (!request || request.status !== editingRequest.status) return;
          return { ...request, ...dispatchData };
        });
        if (!updateResult.committed) throw new Error('This request has changed. Refresh the queue and try again.');
      }

      setEditingRequest(null);
      setToastMessage('Request and delivery details updated');
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Could not update this request.');
    } finally {
      setIsSavingReview(false);
    }
  };

  const verifyDelivery = async (request: AllocationRequest) => {
    try {
      if (!database) {
        const nextRequests = getStoredRequests().map((item) => item.id === request.id
          ? { ...item, deliveryVerified: true, deliveryVerifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          : item);
        persistRequests(nextRequests);
        setRequests(nextRequests.sort((first, second) => second.id.localeCompare(first.id)));
        setToastMessage('Delivery confirmed');
        return;
      }
      const timestamp = new Date().toISOString();
      await update(ref(database!), {
        [`allocationRequests/${request.id}/deliveryVerified`]: true,
        [`allocationRequests/${request.id}/deliveryVerifiedAt`]: timestamp,
        [`allocationRequests/${request.id}/updatedAt`]: timestamp,
      });
      setToastMessage('Delivery confirmed');
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Could not verify this delivery.');
    }
  };

  const canManageFarmerRequest = (request: AllocationRequest) =>
    isFarmer && request.status === 'pending' && request.requesterUid === user?.uid;

  const handleRequestTouchStart = (event: TouchEvent<HTMLElement>, request: AllocationRequest) => {
    if (!canManageFarmerRequest(request)) {
      swipeStart.current = null;
      setOpenSwipeRequestId(null);
      return;
    }
    const touch = event.touches[0];
    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleRequestTouchEnd = (event: TouchEvent<HTMLElement>, request: AllocationRequest) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || !canManageFarmerRequest(request)) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 44 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    setOpenSwipeRequestId(deltaX < 0 ? request.id : null);
  };

  return (
    <section className="role-workspace requests-workspace">
      {isFarmer && !trackingOnly && <section id="request-seed-allocation" className="inventory-panel request-form-panel">
        <div className="panel-heading request-panel-heading">
          <div>
            <p className="eyebrow">SEED ALLOCATION</p>
            <h2>{editingFarmerRequestId ? 'Edit allocation request' : 'Request seed allocation'}</h2>
            <p>Choose a seed variety and tell us where to deliver it.</p>
          </div>
          <span className="request-availability-pill">
            <IonIcon icon={leafOutline} />
            {availableBatchCount} {availableBatchCount === 1 ? 'variety' : 'varieties'} available
          </span>
        </div>
        <form className="request-form" onSubmit={(event) => void submitRequest(event)}>
          <div className="request-batch-field">
            <IonItem className="form-field" lines="none">
              <IonSelect label="Seed batch" labelPlacement="stacked" placeholder="Select a variety" value={selectedBatchId} onIonChange={(event) => setSelectedBatchId(event.detail.value ?? '')}>
                {availableBatches.filter((batch) => batch.stock > 0 || (farmerRequestBeingEdited?.batchId === batch.id)).map((batch) => <IonSelectOption key={batch.id} value={batch.id}>{batch.seedName} · {batch.category} · {batch.stock} bags · {batch.municipality}</IonSelectOption>)}
              </IonSelect>
            </IonItem>
            <p className="available-hint request-selection-hint">
              {availableBatchCount ? 'Select a variety to see its stock and depot.' : 'No seed varieties are currently available.'}
            </p>
          </div>
          <IonItem className="form-field" lines="none"><IonInput label="Bags requested" labelPlacement="stacked" type="number" min="1" max={Math.max(selectedBatch?.stock ?? 0, farmerRequestBeingEdited?.batchId === selectedBatchId ? farmerRequestBeingEdited.requestedBags : 0)} step="1" inputmode="numeric" value={requestedBags} onIonInput={(event) => setRequestedBags(event.detail.value ?? '')} required /></IonItem>
          <IonItem className="form-field" lines="none"><IonInput label="Delivery municipality" labelPlacement="stacked" value={destination} maxlength={80} readonly={Boolean(profile?.municipality)} onIonInput={(event) => setDestination(event.detail.value ?? '')} required /></IonItem>
          <IonItem className="form-field request-note-field" lines="none"><IonInput label="Notes for the agriculture office" labelPlacement="stacked" placeholder="Optional" value={requestNote} maxlength={250} onIonInput={(event) => setRequestNote(event.detail.value ?? '')} /></IonItem>
          {selectedBatch && (
            <div className="request-selected-batch" aria-live="polite">
              {selectedBatch.imageUrl
                ? (
                  <button
                    className="request-selected-batch-image-button"
                    type="button"
                    onClick={() => setViewingBatchImage(selectedBatch)}
                    aria-label={`View larger image of ${selectedBatch.seedName}`}
                  >
                    <img src={selectedBatch.imageUrl} alt={`${selectedBatch.seedName} seeds`} loading="lazy" />
                    <span>View photo</span>
                  </button>
                )
                : (
                  <div className="request-selected-batch-mark" aria-label="No seed photo available">
                    <IonIcon icon={leafOutline} />
                    <span>No photo</span>
                  </div>
                )}
              <div className="request-selected-batch-copy">
                <strong>{selectedBatch.seedName}</strong>
                <span>{selectedBatch.category} · {selectedBatch.municipality}</span>
                <span>{selectedBatch.depot || 'Depot not listed'}{selectedBatch.batchCode ? ` · Batch ${selectedBatch.batchCode}` : ''}</span>
              </div>
              <span className="request-stock-badge">{selectedBatch.stock} bags available</span>
            </div>
          )}
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="request-form-actions">
            {editingFarmerRequestId && <IonButton fill="clear" color="medium" type="button" onClick={cancelFarmerEdit} disabled={isSubmitting}>Cancel edit</IonButton>}
            <IonButton className="add-button" type="submit" disabled={isSubmitting || (!editingFarmerRequestId && !availableBatchCount) || (Boolean(editingFarmerRequestId) && !selectedBatch)}>{isSubmitting ? <IonSpinner name="dots" /> : editingFarmerRequestId ? 'Save request changes' : 'Submit allocation request'}</IonButton>
          </div>
        </form>
      </section>}

      <section className="inventory-panel">
        <div className="panel-heading"><div><h2>{trackingOnly ? 'Delivery status' : isFarmer ? 'My allocation requests' : 'Allocation queue'}</h2><p>{trackingOnly ? 'Follow each approved order from dispatch through delivery.' : isFarmer ? 'Follow your request through approval and delivery. Swipe a pending request left to edit or delete.' : 'Review requests and coordinate depot dispatch.'}</p></div><span className="batch-count">{visibleRequests.length} {visibleRequests.length === 1 ? (trackingOnly ? 'delivery' : 'request') : (trackingOnly ? 'deliveries' : 'requests')}</span></div>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {isLoading ? <div className="loading-state"><IonSpinner name="crescent" /><span>Loading requests…</span></div> : visibleRequests.length ? (
          <IonList className="request-list" lines="none">
            {visibleRequests.map((request) => {
              const canViewMap = request.status === 'approved' || request.status === 'in_transit';
              const canSwipeManage = canManageFarmerRequest(request);
              const isSwipeOpen = openSwipeRequestId === request.id;
              return (
                <Fragment key={request.id}>
                <div className={`request-swipe-shell${isSwipeOpen ? ' is-swipe-open' : ''}`}>
              <article
                className={`request-row${trackingOnly ? ' tracking-request-row' : ''}${canSwipeManage ? ' is-manageable' : ''}`}
                onTouchStart={(event) => handleRequestTouchStart(event, request)}
                onTouchEnd={(event) => handleRequestTouchEnd(event, request)}
              >
                <span className="request-mark">
                  <IonIcon icon={receiptOutline} />
                  {batchesById.get(request.batchId)?.imageUrl && (
                    <img
                      className="request-seed-image"
                      src={batchesById.get(request.batchId)?.imageUrl}
                      alt={`${request.seedName} seeds`}
                      loading="lazy"
                      onError={(event) => event.currentTarget.remove()}
                    />
                  )}
                </span>
                <div className="request-details">
                  <h3>{request.seedName} <span>{request.category}</span></h3>
                  <p>{request.requestedBags} bags · <IonIcon icon={locationOutline} /> {request.municipality}{!isFarmer && ` · ${request.requesterName}`}</p>
                  {request.truckId && <p className="dispatch-detail"><IonIcon icon={carOutline} /> {request.truckId}{request.freightNote ? ` · ${request.freightNote}` : ''}</p>}
                </div>
                <IonBadge className={`request-status status-${request.status}`}>{statusLabels[request.status]}</IonBadge>
                {trackingOnly && canViewMap && (
                  <IonButton
                    fill="clear"
                    className="delivery-details-toggle"
                    aria-expanded={expandedDeliveryDetails.has(request.id)}
                    aria-controls={`delivery-map-${request.id}`}
                    onClick={() => setExpandedDeliveryDetails((expanded) => {
                      const next = new Set(expanded);
                      if (next.has(request.id)) next.delete(request.id);
                      else next.add(request.id);
                      return next;
                    })}
                  >
                    <IonIcon slot="start" icon={expandedDeliveryDetails.has(request.id) ? chevronUpOutline : chevronDownOutline} />
                    {expandedDeliveryDetails.has(request.id) ? 'Hide details' : 'View details'}
                  </IonButton>
                )}
                {isFarmer && request.status === 'delivered' && (
                  request.deliveryVerified
                    ? <span className="verified-label"><IonIcon icon={checkmarkCircleOutline} /> Received</span>
                    : <IonButton fill="outline" className="verify-button" onClick={() => void verifyDelivery(request)}>Confirm received</IonButton>
                )}
                {canSwipeManage && (
                  <IonButton
                    fill="clear"
                    className="request-swipe-toggle"
                    aria-label={`${isSwipeOpen ? 'Hide' : 'Show'} actions for ${request.seedName} request`}
                    aria-expanded={isSwipeOpen}
                    onClick={() => setOpenSwipeRequestId(isSwipeOpen ? null : request.id)}
                  >
                    <IonIcon slot="icon-only" icon={ellipsisHorizontalOutline} />
                  </IonButton>
                )}
                {isStaff && !trackingOnly && nextStatuses[request.status] && <IonButton fill="outline" className="review-button" onClick={() => openReview(request)}>Review / dispatch</IonButton>}
              </article>
              {canSwipeManage && (
                <div className="request-actions" aria-label={`Actions for ${request.seedName} request`}>
                  <IonButton fill="clear" className="icon-button edit-action" onClick={() => {
                    setOpenSwipeRequestId(null);
                    openFarmerEdit(request);
                  }} aria-label={`Edit request for ${request.seedName}`} title="Edit request">
                    <IonIcon slot="start" icon={createOutline} />
                    Edit
                  </IonButton>
                  <IonButton fill="clear" className="icon-button delete-action" onClick={() => {
                    setOpenSwipeRequestId(null);
                    setPendingDeleteRequest(request);
                  }} aria-label={`Delete request for ${request.seedName}`} title="Delete request" disabled={isDeletingRequest}>
                    <IonIcon slot="start" icon={trashOutline} />
                    Delete
                  </IonButton>
                </div>
              )}
                </div>
              {trackingOnly && (
                <ol className="delivery-status-steps" aria-label={`Delivery progress: ${request.deliveryVerified ? 'Received' : statusLabels[request.status]}`}>
                  {deliveryStages.map((stage, index) => {
                    const currentIndex = request.status === 'delivered' && request.deliveryVerified
                      ? deliveryStages.length - 1
                      : deliveryStages.findIndex((item) => item.status === request.status);
                    const stepClass = index < currentIndex ? 'is-complete' : index === currentIndex ? 'is-current' : '';
                    return (
                      <li
                        key={stage.label}
                        className={stepClass}
                        aria-current={index === currentIndex ? 'step' : undefined}
                      >
                        <span className="delivery-status-step-mark" aria-hidden="true" />
                        <span>{stage.label}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
              {trackingOnly && canViewMap && expandedDeliveryDetails.has(request.id) && (
                <div id={`delivery-map-${request.id}`} className="delivery-details-content">
                  <DeliveryMap request={request} />
                </div>
              )}
                </Fragment>
              );
            })}
          </IonList>
        ) : <div className="empty-state"><span className="empty-mark"><IonIcon icon={receiptOutline} /></span><h3>{trackingOnly ? 'No deliveries to track yet' : isFarmer ? recentOrders.length ? 'No active requests' : 'No requests yet' : 'The request queue is clear'}</h3><p>{trackingOnly ? 'Approved orders will appear here. Open an order to view its route and GPS details.' : isFarmer ? recentOrders.length ? 'Your completed orders are in Recent orders below.' : 'Submit a seed allocation request to get started.' : 'New farmer requests will appear here as they arrive.'}</p></div>}
      </section>

      {isFarmer && !trackingOnly && recentOrders.length > 0 && (
        <section className="inventory-panel recent-orders-panel">
          <div className="panel-heading">
            <div><h2>Recent orders</h2><p>Received deliveries are saved here so you can easily order them again.</p></div>
            <span className="batch-count">{recentOrders.length} {recentOrders.length === 1 ? 'order' : 'orders'}</span>
          </div>
          <IonList className="request-list" lines="none">
            {recentOrders.map((request) => {
              const batch = batchesById.get(request.batchId);
              const isAvailable = Boolean(batch && Number(batch.stock) > 0);
              return (
                <article className="request-row recent-order-row" key={request.id}>
                  <span className="request-mark">
                    <IonIcon icon={receiptOutline} />
                    {batch?.imageUrl && (
                      <img
                        className="request-seed-image"
                        src={batch.imageUrl}
                        alt={`${request.seedName} seeds`}
                        loading="lazy"
                        onError={(event) => event.currentTarget.remove()}
                      />
                    )}
                  </span>
                  <div className="request-details">
                    <h3>{request.seedName} <span>{request.category}</span></h3>
                    <p>{request.requestedBags} bags · <IonIcon icon={locationOutline} /> {request.municipality}</p>
                    <p className="dispatch-detail">Received{request.deliveryVerifiedAt ? ` · ${new Date(request.deliveryVerifiedAt).toLocaleDateString()}` : ''}</p>
                  </div>
                  <IonButton
                    fill="outline"
                    className="request-again-button"
                    onClick={() => requestAgain(request)}
                    disabled={!isAvailable}
                    title={isAvailable ? `Request ${request.seedName} again` : `${request.seedName} is currently unavailable`}
                  >
                    {isAvailable ? 'Request again' : 'Unavailable'}
                  </IonButton>
                </article>
              );
            })}
          </IonList>
        </section>
      )}

      <IonModal
        isOpen={viewingBatchImage !== null}
        onDidDismiss={() => setViewingBatchImage(null)}
        className="seed-image-modal"
        aria-label={viewingBatchImage ? `${viewingBatchImage.seedName} seed image` : 'Seed image'}
      >
        <IonHeader>
          <IonToolbar className="modal-toolbar">
            <IonTitle>{viewingBatchImage?.seedName ?? 'Seed image'}</IonTitle>
            <IonButton slot="end" fill="clear" onClick={() => setViewingBatchImage(null)} aria-label="Close seed image">
              Close
            </IonButton>
          </IonToolbar>
        </IonHeader>
        <IonContent className="seed-image-modal-content">
          {viewingBatchImage?.imageUrl && (
            <figure className="seed-image-viewer">
              <img src={viewingBatchImage.imageUrl} alt={`${viewingBatchImage.seedName} seeds`} />
              <figcaption>
                <strong>{viewingBatchImage.seedName}</strong>
                <span>{viewingBatchImage.category} · {viewingBatchImage.batchCode}</span>
              </figcaption>
            </figure>
          )}
        </IonContent>
      </IonModal>

      <IonModal isOpen={editingRequest !== null} onDidDismiss={() => !isSavingReview && setEditingRequest(null)} className="seed-modal">
        <IonHeader><IonToolbar className="modal-toolbar"><IonTitle>Review allocation</IonTitle></IonToolbar></IonHeader>
        <IonContent className="modal-content">
          <form className="batch-form" onSubmit={(event) => void saveReview(event)}>
            <p className="form-intro">{editingRequest ? `${editingRequest.requestedBags} bags of ${editingRequest.seedName} for ${editingRequest.municipality}.` : ''}</p>
            {editingRequest && <DeliveryMap request={editingRequest} compact />}
            <IonItem className="form-field" lines="none"><IonSelect label="Request status" labelPlacement="stacked" value={reviewStatus} onIonChange={(event) => setReviewStatus(event.detail.value)}>
              {[editingRequest?.status, ...(editingRequest ? nextStatuses[editingRequest.status] ?? [] : [])].filter((status): status is RequestStatus => Boolean(status)).map((status) => <IonSelectOption key={status} value={status}>{statusLabels[status]}</IonSelectOption>)}
            </IonSelect></IonItem>
            <IonItem className="form-field" lines="none"><IonInput label="Truck / freight reference" labelPlacement="stacked" placeholder="e.g. Truck 04" value={truckId} maxlength={80} onIonInput={(event) => setTruckId(event.detail.value ?? '')} /></IonItem>
            <IonItem className="form-field" lines="none"><IonInput label="Dispatch note" labelPlacement="stacked" placeholder="Optional delivery details" value={freightNote} maxlength={250} onIonInput={(event) => setFreightNote(event.detail.value ?? '')} /></IonItem>
            <div className="form-actions"><IonButton fill="clear" color="medium" onClick={() => setEditingRequest(null)} disabled={isSavingReview}>Cancel</IonButton><IonButton className="save-button" type="submit" disabled={isSavingReview}>{isSavingReview ? <IonSpinner name="dots" /> : 'Save update'}</IonButton></div>
          </form>
        </IonContent>
      </IonModal>
      <IonAlert isOpen={pendingDeleteRequest !== null} header="Delete allocation request?" message={pendingDeleteRequest ? `${pendingDeleteRequest.requestedBags} bags of ${pendingDeleteRequest.seedName} will be removed.` : ''} buttons={[{ text: 'Cancel', role: 'cancel' }, { text: 'Delete request', role: 'destructive', handler: () => { void deleteFarmerRequest(); } }]} onDidDismiss={() => setPendingDeleteRequest(null)} />
      <IonToast isOpen={Boolean(toastMessage)} message={toastMessage} duration={2400} onDidDismiss={() => setToastMessage('')} />
    </section>
  );
};

export default RequestsView;