import { IonButton, IonIcon, IonSpinner, IonToast } from '@ionic/react';
import { FirebaseError } from 'firebase/app';
import { updateProfile } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { checkmarkCircleOutline, imageOutline, keyOutline, leafOutline, locationOutline, mailOutline, personOutline } from 'ionicons/icons';
import { equalTo, onValue, orderByChild, query } from 'firebase/database';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useAuth } from '../auth/useAuth';
import { database, storage } from '../firebase';
import { getStoredRequests, requestsFromSnapshot, requestsRef, type AllocationRequest } from '../data/seedlink';

const FarmerProfileView: React.FC = () => {
  const { profile, user, sendPasswordReset } = useAuth();
  const [requests, setRequests] = useState<AllocationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | null>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user || !profile) {
      setRequests([]);
      setIsLoading(false);
      return;
    }

    if (!database) {
      setRequests(getStoredRequests().filter((request) => request.requesterUid === user.uid));
      setIsLoading(false);
      setRequestError('');
      return;
    }

    setIsLoading(true);
    const requestQuery = query(requestsRef()!, orderByChild('requesterUid'), equalTo(user.uid));
    const unsubscribe = onValue(requestQuery, (snapshot) => {
      setRequests(requestsFromSnapshot(snapshot));
      setIsLoading(false);
      setRequestError('');
    }, (syncError) => {
      setIsLoading(false);
      setRequestError(syncError.message || 'Could not load your account activity.');
    });

    return unsubscribe;
  }, [profile, user]);

  const receivedOrders = useMemo(
    () => requests.filter((request) => request.status === 'delivered' && request.deliveryVerified).length,
    [requests],
  );
  const activeRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending' || request.status === 'approved' || request.status === 'in_transit').length,
    [requests],
  );
  const googleProvider = user?.providerData.find((provider) => provider.providerId === 'google.com');
  const profileImageUrl = uploadedAvatarUrl || user?.photoURL || googleProvider?.photoURL || null;
  const accountEmail = profile?.email || user?.email || googleProvider?.email || '';
  const canResetPassword = Boolean(database && user?.providerData.some((provider) => provider.providerId === 'password') && accountEmail);

  useEffect(() => {
    setFailedAvatarUrl(null);
  }, [profileImageUrl]);

  useEffect(() => {
    setUploadedAvatarUrl(null);
    setFailedAvatarUrl(null);
  }, [user?.uid]);

  const uploadProfilePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setToastMessage('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setToastMessage('Choose an image smaller than 5 MB.');
      return;
    }
    if (!user || !storage) {
      setToastMessage('Sign in to a configured Firebase account before uploading a profile photo.');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const photoRef = ref(storage, `users/${user.uid}/profile/avatar`);
      const uploadedPhoto = await uploadBytes(photoRef, file, { contentType: file.type });
      const photoUrl = await getDownloadURL(uploadedPhoto.ref);
      await updateProfile(user, { photoURL: photoUrl });
      setUploadedAvatarUrl(photoUrl);
      setFailedAvatarUrl(null);
      setToastMessage('Profile photo updated.');
    } catch (uploadError) {
      const message = uploadError instanceof FirebaseError && uploadError.code === 'storage/unauthorized'
        ? 'Photo upload was denied. Deploy the Firebase Storage rules, then try again.'
        : uploadError instanceof Error
          ? uploadError.message
          : 'Could not upload your profile photo.';
      setToastMessage(message);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const resetPassword = async () => {
    const email = accountEmail;
    if (!email || !canResetPassword) return;

    setIsSendingReset(true);
    try {
      await sendPasswordReset(email);
      setToastMessage(`Password reset link sent to ${email}.`);
    } catch (resetError) {
      setToastMessage(resetError instanceof Error ? resetError.message : 'Could not send the password reset link.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const initials = (profile?.displayName ?? 'Farmer')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  return (
    <section className="role-workspace farmer-profile-workspace">
      <section className="inventory-panel farmer-profile-card" aria-labelledby="farmer-profile-title">
        <div className="farmer-profile-identity">
          <div className="farmer-profile-photo">
            <div className="farmer-profile-avatar" aria-hidden="true">
              {profileImageUrl && failedAvatarUrl !== profileImageUrl
                ? <img src={profileImageUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedAvatarUrl(profileImageUrl)} />
                : initials}
            </div>
            <input
              ref={photoInputRef}
              className="farmer-profile-photo-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Choose a profile photo"
              onChange={(event) => void uploadProfilePhoto(event)}
            />
            <IonButton
              fill="outline"
              className="farmer-profile-photo-button"
              onClick={() => photoInputRef.current?.click()}
              disabled={isUploadingPhoto || !storage || !user}
              aria-label={profileImageUrl ? 'Change profile photo' : 'Upload profile photo'}
            >
              {isUploadingPhoto ? <IonSpinner name="dots" /> : <IonIcon slot="start" icon={imageOutline} />}
              {isUploadingPhoto ? 'Uploading…' : profileImageUrl ? 'Change photo' : 'Upload photo'}
            </IonButton>
            <span className="farmer-profile-photo-hint">JPG, PNG, or WebP · maximum 5 MB</span>
          </div>
          <div>
            <p className="eyebrow">FARMER ACCOUNT</p>
            <h2 id="farmer-profile-title">{profile?.displayName || 'Farmer'}</h2>
            <span className="farmer-profile-role">Farmer / cooperative</span>
          </div>
        </div>
        <div className="farmer-profile-details">
          <div className="farmer-profile-detail">
            <IonIcon icon={mailOutline} />
            <div><span>Email</span><strong>{accountEmail || 'No email on file'}</strong></div>
          </div>
          <div className="farmer-profile-detail">
            <IonIcon icon={locationOutline} />
            <div><span>Municipality</span><strong>{profile?.municipality || 'Not set'}</strong></div>
          </div>
          <div className="farmer-profile-detail">
            <IonIcon icon={personOutline} />
            <div><span>Account type</span><strong>Farmer</strong></div>
          </div>
        </div>
      </section>

      <section className="summary-grid farmer-profile-summary" aria-label="Your SeedLink activity">
        <article className="summary-item">
          <span className="summary-icon icon-green"><IonIcon icon={leafOutline} /></span>
          <div><span className="summary-label">Active requests</span><strong>{isLoading ? <IonSpinner name="dots" /> : requestError ? '—' : activeRequests}</strong></div>
        </article>
        <article className="summary-item">
          <span className="summary-icon icon-coral"><IonIcon icon={checkmarkCircleOutline} /></span>
          <div><span className="summary-label">Orders received</span><strong>{isLoading ? <IonSpinner name="dots" /> : requestError ? '—' : receivedOrders}</strong></div>
        </article>
      </section>
      {requestError && <div className="error-banner" role="alert">{requestError}</div>}

      <section className="inventory-panel farmer-profile-security">
        <div>
          <h2>Account security</h2>
          <p>
            {canResetPassword
              ? 'Send a password reset link to the email address on your account.'
              : database
                ? 'Your account uses Google sign-in. Manage its password through your Google account.'
                : 'Password management is available for accounts connected to Firebase.'}
          </p>
        </div>
        {canResetPassword && (
          <IonButton fill="outline" className="request-again-button" onClick={() => void resetPassword()} disabled={isSendingReset}>
            <IonIcon slot="start" icon={keyOutline} />
            {isSendingReset ? 'Sending link…' : 'Reset password'}
          </IonButton>
        )}
      </section>

      <IonToast
        isOpen={Boolean(toastMessage)}
        message={toastMessage}
        duration={4000}
        onDidDismiss={() => setToastMessage('')}
      />
    </section>
  );
};

export default FarmerProfileView;
