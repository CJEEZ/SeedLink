import { Capacitor } from '@capacitor/core';
import { IonButton, IonIcon, IonSpinner, IonToast } from '@ionic/react';
import { FirebaseError } from 'firebase/app';
import { updateProfile } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { checkmarkCircleOutline, imageOutline, keyOutline, leafOutline, locationOutline, mailOutline, notificationsOutline, personOutline } from 'ionicons/icons';
import { equalTo, onValue, orderByChild, query } from 'firebase/database';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useAuth } from '../auth/useAuth';
import { database, firebaseVapidKey, storage } from '../firebase';
import { getStoredRequests, requestsFromSnapshot, requestsRef, type AllocationRequest } from '../data/seedlink';
import { getEmailPreferenceReference, saveEmailNotificationPreference } from '../data/emailNotifications';
import { disablePushNotifications, enablePushNotifications, getPushDeviceReference } from '../data/pushNotifications';

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
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(false);
  const [pushSettingsLoaded, setPushSettingsLoaded] = useState(false);
  const [pushSettingsError, setPushSettingsError] = useState('');
  const [isUpdatingPushSettings, setIsUpdatingPushSettings] = useState(false);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false);
  const [emailSettingsLoaded, setEmailSettingsLoaded] = useState(false);
  const [emailSettingsError, setEmailSettingsError] = useState('');
  const [isUpdatingEmailSettings, setIsUpdatingEmailSettings] = useState(false);
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
  const accountEmail = user?.email || profile?.email || googleProvider?.email || '';
  const canResetPassword = Boolean(database && user?.providerData.some((provider) => provider.providerId === 'password') && accountEmail);

  useEffect(() => {
    setFailedAvatarUrl(null);
  }, [profileImageUrl]);

  useEffect(() => {
    setPushSettingsError('');
    setPushSettingsLoaded(false);
    if (!database || !user || profile?.role !== 'farmer') {
      setPushNotificationsEnabled(false);
      setPushSettingsLoaded(true);
      return;
    }

    const deviceTokenRef = getPushDeviceReference(database, user.uid);
    const unsubscribe = onValue(deviceTokenRef, (snapshot) => {
      setPushNotificationsEnabled(snapshot.exists());
      setPushSettingsLoaded(true);
      setPushSettingsError('');
    }, (syncError) => {
      setPushSettingsLoaded(true);
      setPushSettingsError(syncError.message || 'Could not load notification settings.');
    });
    return unsubscribe;
  }, [profile?.role, user]);

  useEffect(() => {
    setEmailSettingsError('');
    setEmailSettingsLoaded(false);
    if (!database || !user || profile?.role !== 'farmer') {
      setEmailNotificationsEnabled(false);
      setEmailSettingsLoaded(true);
      return;
    }

    const unsubscribe = onValue(getEmailPreferenceReference(database, user.uid), (snapshot) => {
      setEmailNotificationsEnabled(snapshot.child('enabled').val() === true);
      setEmailSettingsLoaded(true);
      setEmailSettingsError('');
    }, (syncError) => {
      setEmailSettingsLoaded(true);
      setEmailSettingsError(syncError.message || 'Could not load email notification settings.');
    });
    return unsubscribe;
  }, [profile?.role, user]);

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

  const togglePushNotifications = async () => {
    if (!database || !user || pushSettingsError) return;
    setIsUpdatingPushSettings(true);
    try {
      if (pushNotificationsEnabled) {
        await disablePushNotifications(database, user.uid);
        setPushNotificationsEnabled(false);
        setToastMessage('Push notifications turned off for this device.');
      } else {
        await enablePushNotifications(database, user.uid);
        setPushNotificationsEnabled(true);
        setToastMessage('Push notifications enabled for this device.');
      }
    } catch (pushError) {
      setToastMessage(pushError instanceof Error ? pushError.message : 'Could not update push notification settings.');
    } finally {
      setIsUpdatingPushSettings(false);
    }
  };

  const toggleEmailNotifications = async () => {
    if (!database || !user || !accountEmail || emailSettingsError) return;
    setIsUpdatingEmailSettings(true);
    try {
      const enabled = !emailNotificationsEnabled;
      await saveEmailNotificationPreference(database, user.uid, enabled);
      setEmailNotificationsEnabled(enabled);
      setToastMessage(enabled
        ? `Email updates enabled for ${accountEmail}.`
        : 'Email updates turned off.');
    } catch (emailError) {
      setToastMessage(emailError instanceof Error ? emailError.message : 'Could not update email notification settings.');
    } finally {
      setIsUpdatingEmailSettings(false);
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

      <section className="inventory-panel farmer-push-card" aria-labelledby="farmer-push-title">
        <div className="farmer-push-heading">
          <span className="farmer-push-icon"><IonIcon icon={notificationsOutline} /></span>
          <div>
            <p className="eyebrow">OPTIONAL NOTIFICATIONS</p>
            <h2 id="farmer-push-title">Delivery notifications</h2>
          </div>
        </div>
        <p className="farmer-push-description">
          Get a push notification when your request is approved, on the way, or delivered. Notifications appear on this
          device when you allow them in your browser or Android settings. Turn them off here any time.
        </p>
        {pushSettingsError && <p className="support-error" role="alert">Notifications unavailable: {pushSettingsError}</p>}
        {!database && <p className="farmer-push-note">Connect a Firebase account to manage notifications.</p>}
        {Capacitor.getPlatform() === 'web' && !firebaseVapidKey && (
          <p className="farmer-push-note">Web push needs a Firebase Web Push key. See the Firebase setup instructions.</p>
        )}
        <IonButton
          fill={pushNotificationsEnabled ? 'outline' : 'solid'}
          className={pushNotificationsEnabled ? 'request-again-button farmer-push-toggle' : 'save-button farmer-push-toggle'}
          onClick={() => void togglePushNotifications()}
          disabled={!database || !user || !pushSettingsLoaded || Boolean(pushSettingsError) || isUpdatingPushSettings}
        >
          {isUpdatingPushSettings
            ? <IonSpinner name="dots" />
            : pushNotificationsEnabled
              ? 'Turn off notifications for this device'
              : 'Enable notifications on this device'}
        </IonButton>
      </section>

      <section className="inventory-panel farmer-push-card" aria-labelledby="farmer-email-title">
        <div className="farmer-push-heading">
          <span className="farmer-push-icon"><IonIcon icon={mailOutline} /></span>
          <div>
            <p className="eyebrow">OPTIONAL NOTIFICATIONS</p>
            <h2 id="farmer-email-title">Email request updates</h2>
          </div>
        </div>
        <p className="farmer-push-description">
          Get an email at your SeedLink account address, <strong>{accountEmail || 'No email on file'}</strong>, when you
          submit a request, it is approved or not approved, it goes on the way or is delivered, and when you confirm
          receipt. You can turn these emails off here any time.
        </p>
        <p className="farmer-push-note">
          These messages are sent to your inbox (including Gmail); they are not pop-up notifications. Email delivery
          starts after SeedLink’s email service is configured. Enabling this setting does not send an email immediately.
        </p>
        {emailSettingsError && <p className="support-error" role="alert">Email notifications unavailable: {emailSettingsError}</p>}
        {!database && <p className="farmer-push-note">Connect a Firebase account to manage email notifications.</p>}
        <IonButton
          fill={emailNotificationsEnabled ? 'outline' : 'solid'}
          className={emailNotificationsEnabled ? 'request-again-button farmer-push-toggle' : 'save-button farmer-push-toggle'}
          onClick={() => void toggleEmailNotifications()}
          disabled={!database || !user || !accountEmail || !emailSettingsLoaded || Boolean(emailSettingsError) || isUpdatingEmailSettings}
        >
          {isUpdatingEmailSettings
            ? <IonSpinner name="dots" />
            : emailNotificationsEnabled
              ? 'Turn off email updates'
              : 'Enable email updates'}
        </IonButton>
      </section>

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
