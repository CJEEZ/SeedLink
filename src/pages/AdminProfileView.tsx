import { IonButton, IonIcon, IonSpinner, IonToast } from '@ionic/react';
import { FirebaseError } from 'firebase/app';
import { updateProfile } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { imageOutline, keyOutline, mailOutline, personOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useAuth } from '../auth/useAuth';
import { database, storage } from '../firebase';

const AdminProfileView: React.FC = () => {
  const { profile, user, sendPasswordReset } = useAuth();
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | null>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const googleProvider = user?.providerData.find((provider) => provider.providerId === 'google.com');
  const passwordProvider = user?.providerData.some((provider) => provider.providerId === 'password') ?? false;
  const accountEmail = profile?.email || user?.email || googleProvider?.email || '';
  const profileImageUrl = uploadedAvatarUrl || user?.photoURL || googleProvider?.photoURL || null;
  const canResetPassword = Boolean(database && passwordProvider && accountEmail);
  const signInMethod = passwordProvider && googleProvider
    ? 'Email and Google'
    : googleProvider
      ? 'Google'
      : passwordProvider
        ? 'Email and password'
        : 'Managed sign-in';
  const initials = (profile?.displayName || 'Admin')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  useEffect(() => setFailedAvatarUrl(null), [profileImageUrl]);
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
    if (!canResetPassword || !accountEmail) return;
    setIsSendingReset(true);
    try {
      await sendPasswordReset(accountEmail);
      setToastMessage(`Password reset link sent to ${accountEmail}.`);
    } catch (resetError) {
      setToastMessage(resetError instanceof Error ? resetError.message : 'Could not send the password reset link.');
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <section className="admin-profile-workspace">
      <section className="inventory-panel admin-profile-card" aria-labelledby="admin-profile-title">
        <div className="admin-profile-identity">
          <div className="admin-profile-photo">
            <div className="admin-profile-avatar" aria-hidden="true">
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
          <div className="admin-profile-heading">
            <p className="eyebrow">SEEDLINK ACCOUNT</p>
            <h2 id="admin-profile-title">{profile?.displayName || 'Administrator'}</h2>
            <span className="admin-profile-role"><IonIcon icon={shieldCheckmarkOutline} /> Agriculture administrator</span>
          </div>
        </div>
        <div className="admin-profile-details">
          <div className="admin-profile-detail">
            <IonIcon icon={mailOutline} />
            <div><span>Email address</span><strong>{accountEmail || 'No email on file'}</strong></div>
          </div>
          <div className="admin-profile-detail">
            <IonIcon icon={personOutline} />
            <div><span>Account ID</span><strong>{user?.uid || 'Local demo account'}</strong></div>
          </div>
          <div className="admin-profile-detail">
            <IonIcon icon={keyOutline} />
            <div><span>Sign-in method</span><strong>{signInMethod}</strong></div>
          </div>
        </div>
      </section>

      <section className="inventory-panel admin-profile-access">
        <div className="admin-profile-access-icon"><IonIcon icon={shieldCheckmarkOutline} /></div>
        <div className="admin-profile-access-copy">
          <h3>Administrator access</h3>
          <p>Your role is managed by SeedLink. It grants access to provincial overview, seed inventory, allocation review, delivery tracking, and customer-service conversations.</p>
          <span>For account or access changes, contact the system owner.</span>
        </div>
      </section>

      <section className="inventory-panel farmer-profile-security admin-profile-security">
        <div>
          <h2>Account security</h2>
          <p>
            {canResetPassword
              ? 'Send a password reset link to the email address on your account.'
              : database
                ? 'Your account uses Google or administrator-managed sign-in. Manage its password with your sign-in provider.'
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

export default AdminProfileView;
